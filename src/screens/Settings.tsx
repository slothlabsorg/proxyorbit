import { useState, useEffect } from 'react'
import type { ProxySettings } from '@/types'
import Button from '@/components/ui/Button'
import { api } from '@/lib/tauri'
import { mockSettings } from '@/mock/data'

const URL_MOCK = new URL(window.location.href).searchParams.get('mock') === '1'

export function Settings() {
  const [settings, setSettings] = useState<ProxySettings>(mockSettings)
  const [saved, setSaved] = useState(false)
  const [excludeInput, setExcludeInput] = useState('')

  useEffect(() => {
    if (URL_MOCK) return
    api.getSettings().then(setSettings).catch(() => {})
  }, [])

  async function handleSave() {
    if (!URL_MOCK) {
      await api.saveSettings(settings).catch(() => {})
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function addExclude() {
    const host = excludeInput.trim()
    if (!host || settings.exclude_hosts.includes(host)) return
    setSettings(s => ({ ...s, exclude_hosts: [...s.exclude_hosts, host] }))
    setExcludeInput('')
  }

  function removeExclude(host: string) {
    setSettings(s => ({ ...s, exclude_hosts: s.exclude_hosts.filter(h => h !== host) }))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-lg">
        <div className="mb-6">
          <h1 className="text-text-primary font-display font-bold text-lg">Settings</h1>
          <p className="text-text-muted text-xs mt-0.5">Configure proxy behavior and system integration</p>
        </div>

        <div className="space-y-6">
          {/* Proxy port */}
          <Section title="Proxy Port" description="Local port to listen on for intercepted traffic">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1024} max={65535}
                value={settings.port}
                onChange={e => setSettings(s => ({ ...s, port: parseInt(e.target.value) || 8080 }))}
                className="field-input w-32"
              />
              <span className="text-text-muted text-xs">Configure your app's proxy to: 127.0.0.1:{settings.port}</span>
            </div>
          </Section>

          {/* Toggles */}
          <Section title="Behavior">
            <div className="space-y-3">
              <Toggle
                label="Auto-start on launch"
                description="Start intercepting traffic when ProxyOrbit opens"
                value={settings.auto_start}
                onChange={v => setSettings(s => ({ ...s, auto_start: v }))}
              />
              <Toggle
                label="Auto-configure system proxy"
                description="Automatically set macOS system HTTP/HTTPS proxy when starting"
                value={settings.auto_set_system_proxy}
                onChange={v => setSettings(s => ({ ...s, auto_set_system_proxy: v }))}
              />
            </div>
          </Section>

          {/* Max entries */}
          <Section title="Max Entries" description="Maximum number of requests to keep in memory">
            <input
              type="number"
              min={100} max={100000} step={1000}
              value={settings.max_entries}
              onChange={e => setSettings(s => ({ ...s, max_entries: parseInt(e.target.value) || 10000 }))}
              className="field-input w-40"
            />
          </Section>

          {/* Exclude hosts */}
          <Section title="Exclude Hosts" description="Traffic from these hosts will not be captured">
            <div className="flex gap-2 mb-2">
              <input
                className="field-input flex-1"
                placeholder="e.g. localhost, 127.0.0.1, *.local"
                value={excludeInput}
                onChange={e => setExcludeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExclude()}
              />
              <Button variant="secondary" size="sm" onClick={addExclude}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {settings.exclude_hosts.map(host => (
                <span
                  key={host}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-bg-surface border border-border text-text-secondary"
                >
                  {host}
                  <button
                    onClick={() => removeExclude(host)}
                    className="text-text-muted hover:text-danger transition-colors ml-0.5"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </Section>

          {/* HTTPS MITM */}
          <HttpsMitmSection />

          {/* Save */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="primary" onClick={handleSave}>Save Settings</Button>
            {saved && <span className="text-success text-xs">✓ Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-text-primary text-sm font-semibold">{title}</h3>
        {description && <p className="text-text-muted text-[11px] mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Toggle({
  label, description, value, onChange,
}: {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-text-primary text-xs font-medium">{label}</p>
        {description && <p className="text-text-muted text-[11px] mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
          value ? 'bg-primary' : 'bg-bg-overlay'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          value ? 'left-0 translate-x-4' : 'left-0 translate-x-0.5'
        }`} />
      </button>
    </div>
  )
}

// Need React import for Section JSX
import React from 'react'

/**
 * HTTPS MITM controls. The UI walks the user through enabling the CA
 * (download / install / trust), shows the on-disk path, and lets them
 * opt hosts out of interception for cert-pinned apps.
 *
 * In mock mode the toggle is a no-op so tests can snapshot the UI without
 * needing a real Rust backend.
 */
function HttpsMitmSection() {
  const [enabled, setEnabled] = React.useState(false)
  const [caPath, setCaPath] = React.useState<string | null>(null)
  const [caPem, setCaPem] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (URL_MOCK) { setCaPath('~/.proxyorbit/ca/ca.pem'); return }
    api.getProxyStatus().then(s => setEnabled(s.mitm_enabled)).catch(() => {})
    api.getCaPemPath().then(setCaPath).catch(() => {})
  }, [])

  const toggle = async (v: boolean) => {
    setEnabled(v)
    if (URL_MOCK) return
    try {
      await api.setMitmEnabled(v)
      if (v && caPath === null) setCaPath(await api.getCaPemPath())
    } catch (e) {
      setEnabled(!v) // revert on error
      console.error('set_mitm_enabled failed:', e)
    }
  }

  const showPem = async () => {
    if (URL_MOCK) {
      setCaPem('-----BEGIN CERTIFICATE-----\n(mock CA — enable in a real run)\n-----END CERTIFICATE-----')
      return
    }
    try { setCaPem(await api.getCaPem()) } catch (e) { console.error(e) }
  }

  const copyPem = async () => {
    if (!caPem) return
    try { await navigator.clipboard.writeText(caPem); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* denied */ }
  }

  return (
    <Section
      title="HTTPS Inspection (MITM)"
      description="Decrypt HTTPS traffic with a local root CA you trust once. Required to inspect headers/body of API calls to GitHub, OpenAI, your own APIs, etc."
    >
      <div className="space-y-3">
        <Toggle
          label="Enable HTTPS inspection"
          description="Generates a local root CA the first time it's turned on."
          value={enabled}
          onChange={toggle}
        />
        {caPath && (
          <div className="rounded-lg border border-border bg-bg-surface p-3 space-y-2">
            <div>
              <p className="text-text-primary text-[11px] font-semibold">Install the ProxyOrbit root CA</p>
              <p className="text-text-muted text-[10px] mt-0.5">
                Without this, your browser / OS will refuse the MITM'd TLS connections.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono text-text-secondary bg-bg-base border border-border-subtle rounded px-2 py-1 truncate">{caPath}</code>
              <Button variant="secondary" size="sm" onClick={showPem}>
                {caPem ? 'Shown' : 'Show PEM'}
              </Button>
            </div>
            {caPem && (
              <>
                <pre className="text-[10px] font-mono text-text-secondary bg-bg-base border border-border-subtle rounded px-2 py-1 max-h-32 overflow-auto whitespace-pre-wrap break-all">
                  {caPem}
                </pre>
                <Button variant="secondary" size="sm" onClick={copyPem}>
                  {copied ? '✓ Copied' : 'Copy PEM'}
                </Button>
              </>
            )}
            <details className="text-[11px] text-text-secondary">
              <summary className="cursor-pointer text-text-muted hover:text-text-primary">
                Install instructions ▾
              </summary>
              <div className="mt-2 space-y-2 pl-2">
                <div>
                  <p className="font-semibold text-text-primary">macOS</p>
                  <code className="block text-[10px] font-mono bg-bg-base border border-border-subtle rounded px-2 py-1 mt-1 whitespace-nowrap overflow-auto">
                    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain {caPath}
                  </code>
                  <p className="text-[10px] text-text-muted mt-1">
                    Or: open Keychain Access → File → Import Items → select the file above →
                    drag it to <strong>System</strong> → double-click → expand Trust → "Always Trust".
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Linux</p>
                  <code className="block text-[10px] font-mono bg-bg-base border border-border-subtle rounded px-2 py-1 mt-1 whitespace-nowrap overflow-auto">
                    sudo cp {caPath} /usr/local/share/ca-certificates/proxyorbit.crt && sudo update-ca-certificates
                  </code>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Windows</p>
                  <code className="block text-[10px] font-mono bg-bg-base border border-border-subtle rounded px-2 py-1 mt-1 whitespace-nowrap overflow-auto">
                    certutil -addstore -user "ROOT" {caPath}
                  </code>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Firefox / Node.js / cURL</p>
                  <p className="text-[10px] text-text-muted">
                    Firefox has its own trust store — about:preferences#privacy → Certificates → Import.
                    Node.js: <code className="text-text-secondary">NODE_EXTRA_CA_CERTS={caPath}</code>.
                    cURL: <code className="text-text-secondary">curl --cacert {caPath}</code>.
                  </p>
                </div>
              </div>
            </details>
          </div>
        )}
        <p className="text-[10px] text-text-muted">
          Some apps use certificate pinning (banking, some mobile SDKs) and will
          refuse our substituted cert. Add them to the exclude list above to keep
          them on the blind-tunnel path.
        </p>
      </div>
    </Section>
  )
}

export default Settings
