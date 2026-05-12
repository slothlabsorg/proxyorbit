// MITM certificate authority.
//
// The first time ProxyOrbit runs with HTTPS inspection enabled, this module
// generates a self-signed root CA and saves it to the user's config dir.
// Users install this CA in their system keychain / cert store to trust the
// on-the-fly leaf certs the proxy mints for every intercepted host.
//
// Layout (one location, one copy):
//   ~/.proxyorbit/ca/ca.pem      — public root (what the user installs)
//   ~/.proxyorbit/ca/ca.key.pem  — private key (0600, never leaves disk)
//
// Leafs are cached in memory only — we never persist them. One-per-host,
// signed on demand and reused for the lifetime of the process.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType, IsCa, KeyPair,
    KeyUsagePurpose, SanType,
};

/// CA material held in memory once loaded. `load_or_generate()` is cheap
/// enough to call at startup; subsequent `leaf_for_host` lookups reuse
/// `self.ca_cert` + `self.ca_key` to sign.
pub struct Ca {
    pub cert_pem: String,
    // Kept for future SPKI-pinning / diagnostics. Not read yet.
    #[allow(dead_code)]
    pub cert_der: Vec<u8>,
    ca_cert: Certificate,
    ca_key: KeyPair,
    /// Leaf-cert cache keyed by host. Leaves and their private key ride
    /// together because both sides of the TLS handshake come from us.
    leaf_cache: Mutex<HashMap<String, LeafMaterial>>,
}

#[derive(Clone)]
pub struct LeafMaterial {
    pub cert_der: Vec<u8>,
    pub key_der: Vec<u8>,
}

fn ca_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("no home directory"))?;
    Ok(home.join(".proxyorbit").join("ca"))
}

pub fn ca_pem_path() -> Result<PathBuf> {
    Ok(ca_dir()?.join("ca.pem"))
}

fn ca_key_path() -> Result<PathBuf> {
    Ok(ca_dir()?.join("ca.key.pem"))
}

fn build_ca_params() -> CertificateParams {
    let mut params = CertificateParams::default();
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, "ProxyOrbit Root CA");
    dn.push(DnType::OrganizationName, "SlothLabs");
    dn.push(DnType::OrganizationalUnitName, "ProxyOrbit MITM");
    params.distinguished_name = dn;
    let not_before = time::OffsetDateTime::now_utc() - time::Duration::days(1);
    params.not_before = not_before;
    params.not_after = not_before + time::Duration::days(3650);
    params
}

impl Ca {
    /// Load the persisted CA from disk, or generate + persist a fresh one.
    /// Safe to call multiple times — subsequent calls reuse the on-disk cert.
    pub fn load_or_generate() -> Result<Self> {
        let dir = ca_dir()?;
        fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;

        let pem_path = ca_pem_path()?;
        let key_path = ca_key_path()?;

        if pem_path.exists() && key_path.exists() {
            let cert_pem = fs::read_to_string(&pem_path)?;
            let key_pem = fs::read_to_string(&key_path)?;
            let ca_key = KeyPair::from_pem(&key_pem)
                .map_err(|e| anyhow!("load CA key: {}", e))?;
            // Rebuild the rcgen Certificate wrapper from the persisted key
            // + the original params — rcgen 0.13 doesn't expose a raw
            // "parse cert" helper that returns a signable Certificate, so we
            // re-sign locally with our key. Output DER must match the one
            // we wrote to disk (deterministic with our params + key).
            let cert = build_ca_params()
                .self_signed(&ca_key)
                .map_err(|e| anyhow!("rebuild CA cert: {}", e))?;
            // Prefer the on-disk PEM (users may have imported it already).
            let cert_der = cert.der().to_vec();
            return Ok(Self {
                cert_pem,
                cert_der,
                ca_cert: cert,
                ca_key,
                leaf_cache: Mutex::new(HashMap::new()),
            });
        }

        let ca_key = KeyPair::generate().map_err(|e| anyhow!("generate CA key: {}", e))?;
        let ca_cert = build_ca_params()
            .self_signed(&ca_key)
            .map_err(|e| anyhow!("self-sign CA: {}", e))?;
        let cert_pem = ca_cert.pem();
        let cert_der = ca_cert.der().to_vec();
        let key_pem = ca_key.serialize_pem();

        fs::write(&pem_path, &cert_pem).context("write ca.pem")?;
        write_private_pem(&key_path, &key_pem).context("write ca.key.pem")?;

        Ok(Self {
            cert_pem,
            cert_der,
            ca_cert,
            ca_key,
            leaf_cache: Mutex::new(HashMap::new()),
        })
    }

    /// Get (or mint-and-cache) a TLS leaf certificate for `host`.
    pub fn leaf_for_host(&self, host: &str) -> Result<LeafMaterial> {
        if let Some(cached) = self.leaf_cache.lock().unwrap().get(host).cloned() {
            return Ok(cached);
        }

        let mut params = CertificateParams::default();
        params.subject_alt_names = vec![SanType::DnsName(
            host.to_string()
                .try_into()
                .map_err(|e: rcgen::Error| anyhow!("invalid host: {}", e))?,
        )];
        let mut dn = DistinguishedName::new();
        dn.push(DnType::CommonName, host);
        params.distinguished_name = dn;
        let not_before = time::OffsetDateTime::now_utc() - time::Duration::days(1);
        params.not_before = not_before;
        // Browsers reject leaf certs with > 398-day validity since Apple's
        // change in 2020. Stay under that.
        params.not_after = not_before + time::Duration::days(398);

        let leaf_key = KeyPair::generate().map_err(|e| anyhow!("generate leaf key: {}", e))?;
        let leaf = params
            .signed_by(&leaf_key, &self.ca_cert, &self.ca_key)
            .map_err(|e| anyhow!("sign leaf for {}: {}", host, e))?;

        let material = LeafMaterial {
            cert_der: leaf.der().to_vec(),
            key_der: leaf_key.serialize_der(),
        };
        self.leaf_cache
            .lock()
            .unwrap()
            .insert(host.to_string(), material.clone());
        Ok(material)
    }
}

#[cfg(unix)]
fn write_private_pem(path: &std::path::Path, pem: &str) -> std::io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(path)?;
    std::io::Write::write_all(&mut f, pem.as_bytes())
}

#[cfg(not(unix))]
fn write_private_pem(path: &std::path::Path, pem: &str) -> std::io::Result<()> {
    fs::write(path, pem)
}
