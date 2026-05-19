<div align="center">
  <h1>🔍 ProxyOrbit — Free Charles Proxy Alternative for macOS</h1>
  <p><strong>The free, native HTTP/HTTPS proxy inspector for developers. Capture traffic from any Mac app, filter by method/status, inspect requests in real time, replay and modify — without Charles, without Proxyman, without a subscription.</strong></p>

  [![Release](https://img.shields.io/github/v/release/slothlabsorg/proxyorbit?style=flat-square)](https://github.com/slothlabsorg/proxyorbit/releases)
  [![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-blue.svg?style=flat-square)](LICENSE)
  [![GitHub Sponsors](https://img.shields.io/github/sponsors/slothlabsorg?style=flat-square&logo=github&color=pink)](https://github.com/sponsors/slothlabsorg)
  [![Website](https://img.shields.io/badge/web-slothlabs.org-94A3B8?style=flat-square)](https://slothlabs.org/proxyorbit)
</div>

---

## What is ProxyOrbit?

**ProxyOrbit is a free Charles Proxy alternative for macOS.** Run a local intercepting proxy, watch every HTTP/HTTPS request in real time, inspect headers and bodies, replay, intercept and modify — all from a clean native UI.

If you've been paying $50 for **Charles Proxy** or $69/year for **Proxyman**, ProxyOrbit replaces both with a native Rust app that uses < 30 MB of RAM at idle. The proxy engine is built on Hyper + Tokio (no Java, no Electron, no Chromium), and the UI shows process attribution so you know exactly which Mac app made each request.

Part of the [SlothLabs](https://slothlabs.org) family — native Rust, free forever.

---

## What it does

ProxyOrbit starts a local HTTP/HTTPS proxy on a port you choose (default 8080) and, on macOS, auto-configures your system's network settings to route traffic through it. Every request is captured in a live feed with method, status, URL, headers, body, and timing. Close the app and macOS proxy state is restored automatically.

For HTTPS body inspection, toggle on MITM mode — ProxyOrbit generates a local root CA and mints per-host leaf certs on the fly.

---

## Features

| Feature | Status |
|---|---|
| HTTP/HTTPS intercepting proxy (tokio + hyper) | ✅ |
| Real-time request log with live feed | ✅ |
| Request/response headers + body capture | ✅ |
| HTTPS MITM inspection with on-the-fly CA | ✅ |
| Copy as cURL | ✅ |
| Replay request (edit + send) | ✅ |
| Intercept + modify (pause → edit → forward / drop) | ✅ |
| Pretty-print JSON / collapsible body viewer | ✅ |
| Filter by URL / method / status / protocol | ✅ |
| System proxy auto-configure on macOS (`networksetup`) | ✅ |
| Windows & Linux binaries | ✅ |
| WebSocket frame inspection | 🚧 v1.1 |
| Windows/Linux GUI auto-configure | 🚧 v1.1 |

---

## Installation

Grab the latest installer from the [Releases](https://github.com/slothlabsorg/proxyorbit/releases) page:

| Platform | Download |
|---|---|
| macOS Apple Silicon | `.dmg` (arm64) |
| macOS Intel | `.dmg` (x64) |
| Windows | `.msi` or `.exe` |
| Linux | `.deb` or `.AppImage` |

> ProxyOrbit is currently unsigned — on macOS right-click the app and choose "Open" the first time. On Windows, approve the SmartScreen prompt.

---

## Usage

1. Launch ProxyOrbit.
2. Click **Start** — the proxy listens on `127.0.0.1:8080`.
3. On macOS with *Auto-configure system proxy* enabled, GUI apps (browsers, Postman, Slack) route traffic automatically. New terminals pick up `HTTPS_PROXY` too.
4. Click any request row for full headers, body, Copy as cURL, Replay, or Intercept.

For HTTPS request/response bodies, toggle **MITM HTTPS inspection** in Settings and install the generated CA (see below).

---

## Corporate / Zscaler / MDM environments

On managed Macs with Zscaler, Jamf, Crowdstrike, or similar MDM tooling, `networksetup -set*proxystate on` often silently no-ops — the command exits `0` but System Settings → Network still shows proxies disabled. You'll also typically find a forced `SSL_CERT_FILE=/…/ZscalerRootCA.pem` in your environment.

In this case auto-configure can't persist the GUI proxy. Use one of these escape hatches instead.

### 1. Shell aliases (recommended)

Add to `~/.zshrc` or `~/.bashrc` — flip the proxy on/off in any terminal with `proxyon` / `proxyoff`:

```bash
# ProxyOrbit — CLI proxy toggle (zsh / bash)
export PROXYORBIT_CA="$HOME/.proxyorbit/ca/ca.pem"

proxyon() {
  export HTTPS_PROXY="http://127.0.0.1:8080"
  export HTTP_PROXY="http://127.0.0.1:8080"
  export ALL_PROXY="http://127.0.0.1:8080"
  export https_proxy="$HTTPS_PROXY"
  export http_proxy="$HTTP_PROXY"
  export all_proxy="$ALL_PROXY"
  # Trust ProxyOrbit's CA for the MITM leaf certs. If Zscaler already set
  # SSL_CERT_FILE, stash it and restore in proxyoff.
  [ -n "$SSL_CERT_FILE" ] && export SSL_CERT_FILE_PRE_PROXYORBIT="$SSL_CERT_FILE"
  export SSL_CERT_FILE="$PROXYORBIT_CA"
  export NODE_EXTRA_CA_CERTS="$PROXYORBIT_CA"
  export REQUESTS_CA_BUNDLE="$PROXYORBIT_CA"
  export CURL_CA_BUNDLE="$PROXYORBIT_CA"
  echo "ProxyOrbit: ON (127.0.0.1:8080)"
}

proxyoff() {
  unset HTTPS_PROXY HTTP_PROXY ALL_PROXY https_proxy http_proxy all_proxy \
        NODE_EXTRA_CA_CERTS REQUESTS_CA_BUNDLE CURL_CA_BUNDLE
  if [ -n "$SSL_CERT_FILE_PRE_PROXYORBIT" ]; then
    export SSL_CERT_FILE="$SSL_CERT_FILE_PRE_PROXYORBIT"
    unset SSL_CERT_FILE_PRE_PROXYORBIT
  else
    unset SSL_CERT_FILE
  fi
  echo "ProxyOrbit: OFF"
}
```

### 2. Per-command with curl

```bash
curl --proxy http://127.0.0.1:8080 \
     --cacert ~/.proxyorbit/ca/ca.pem \
     https://api.example.com/endpoint
```

### 3. Manual GUI proxy (requires sudo, may be blocked by MDM)

```bash
sudo networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080
sudo networksetup -setwebproxystate "Wi-Fi" on
sudo networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080
sudo networksetup -setsecurewebproxystate "Wi-Fi" on
networksetup -getwebproxy "Wi-Fi"  # if Enabled=No, MDM is blocking it
```

### App crashed and terminals can't reach the network

ProxyOrbit clears its launchd proxy URL env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` and lowercase) on graceful exit and on SIGTERM/SIGINT. If it's killed by SIGKILL, panic, or OS shutdown before the hook runs, those vars survive and every new process routes through a dead `127.0.0.1:8080`.

**Self-heal:** relaunch ProxyOrbit. On boot it detects orphaned env vars and clears them automatically.

**Manual fix:**
```bash
for k in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
  launchctl unsetenv "$k"
done
# Then relaunch any already-open terminals / IDEs.
```

CA-trust env vars (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, …) are deliberately left in place when the app dies — they're additive, the referenced PEM file still exists, and clearing them could push Node tools off whatever VPN/corporate trust chain you had layered.

### JetBrains / VSCode terminal doesn't pick up proxy

When the IDE is launched *before* ProxyOrbit, its embedded terminal inherits the old environment. Either relaunch the IDE, use the `proxyon` alias inside the IDE terminal, or launch the IDE from a shell that already has `proxyon` set.

---

## Per-tool proxy config

### VSCode
Settings → `http.proxy`: `http://127.0.0.1:8080`. For Node extensions also set `NODE_EXTRA_CA_CERTS` before launching VSCode.

### IntelliJ / PyCharm / WebStorm / Rider
Settings → Appearance & Behavior → System Settings → HTTP Proxy → Manual:
`127.0.0.1:8080`, check "Also use for HTTPS". Accept the CA under *Tools → Server Certificates* the first time.

### Node.js
```bash
NODE_EXTRA_CA_CERTS=~/.proxyorbit/ca/ca.pem
HTTPS_PROXY=http://127.0.0.1:8080
HTTP_PROXY=http://127.0.0.1:8080
```

### Python (requests, httpx, urllib3, aiohttp)
```bash
export REQUESTS_CA_BUNDLE=~/.proxyorbit/ca/ca.pem
export HTTPS_PROXY=http://127.0.0.1:8080
export HTTP_PROXY=http://127.0.0.1:8080
```

### AWS CLI
```bash
export AWS_CA_BUNDLE=~/.proxyorbit/ca/ca.pem
export HTTPS_PROXY=http://127.0.0.1:8080
```

### Go
```bash
# net/http respects HTTPS_PROXY automatically
export SSL_CERT_FILE=~/.proxyorbit/ca/ca.pem
```

### Postman / Insomnia
Settings → Proxy → "Use custom proxy configuration" → `127.0.0.1:8080`.
Either disable SSL verification or add `~/.proxyorbit/ca/ca.pem` as a trusted root.

### Docker
```bash
docker run --rm \
  -e HTTPS_PROXY=http://host.docker.internal:8080 \
  -e HTTP_PROXY=http://host.docker.internal:8080 \
  -v ~/.proxyorbit/ca/ca.pem:/usr/local/share/ca-certificates/proxyorbit.crt \
  my-image
```

---

## Installing the MITM CA

After toggling on HTTPS inspection in Settings, install the CA once:

**macOS**
```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain ~/.proxyorbit/ca/ca.pem
```

**Linux (Debian/Ubuntu)**
```bash
sudo cp ~/.proxyorbit/ca/ca.pem /usr/local/share/ca-certificates/proxyorbit.crt
sudo update-ca-certificates
```

**Windows (PowerShell, admin)**
```powershell
Import-Certificate -FilePath "$env:USERPROFILE\.proxyorbit\ca\ca.pem" `
  -CertStoreLocation Cert:\LocalMachine\Root
```

Firefox keeps a separate trust store — import via Settings → Privacy & Security → Certificates → View Certificates → Authorities.

---

## Development

Requirements: Node 18+, Rust stable, Tauri v2 CLI.

```bash
npm install
npm run tauri dev
```

Browser dev mode (mock data, no Tauri binary):
```bash
npm run dev
# http://localhost:1423/?mock=1
```

---

## Testing

```bash
npm test              # Vitest
npm run screenshots   # Playwright screenshots
cd src-tauri && cargo test
```

---

## Platform support

| Platform | Proxy | Auto-configure | MITM | Notes |
|---|---|---|---|---|
| macOS (Apple Silicon + Intel) | ✅ | ✅ | ✅ | `launchctl setenv` for new terminals |
| Windows | ✅ | 🚧 v1.1 | ✅ | configure HTTP_PROXY env vars manually |
| Linux | ✅ | 🚧 v1.1 | ✅ | `.deb` declares `libwebkit2gtk-4.1-0` deps |

---

## Roadmap

### v1.1
- WebSocket frame inspection
- Windows/Linux GUI auto-configure
- Export HAR

### v1.2
- Breakpoints with conditional matchers
- Mock responses (rewrite rules)
- Session persistence across launches

---

## We need your help 🙏

ProxyOrbit is built solo on nights and weekends. Concrete things contributors can pick up:

- 🦀 **Rust contributors** — breakpoint engine, conditional matchers, response rewriting
- ⚛️ **React contributors** — diff view for replays, request curl-export polish
- 🪟 **Windows port** — system proxy hookup via `netsh winhttp`
- 🐧 **Linux port** — system proxy via `gsettings` / `kwriteconfig`
- 📝 **Docs** — HTTPS cert install guides for non-macOS platforms
- 🧪 **Beta testers** — particularly with Node.js / Python / Go HTTP clients

Pick anything labeled `good-first-issue` or `help-wanted` on the [tracker](https://github.com/slothlabsorg/proxyorbit/issues).

---

## Support the project

ProxyOrbit is free and built on nights and weekends. If it saves you time:

- ☕ [Ko-fi](https://ko-fi.com/slothlabs)
- ❤️ [GitHub Sponsors](https://github.com/sponsors/slothlabsorg)
- ⭐ [Polar.sh](https://polar.sh/slothlabs)

---

## Other SlothLabs tools

| | | |
|---|---|---|
| ☁️ [CloudOrbit](https://slothlabs.org/cloudorbit) | AWS client UI for macOS · SSO, EKS, kubeconfig | macOS · Win · Linux |
| ⚡ [WattsOrbit](https://slothlabs.org/wattsorbit) | Mac power monitor for the menu bar | macOS · Win · Linux |
| 🗄️ [DataOrbit](https://slothlabs.org/dataorbit) | Native DynamoDB GUI · live streams, cross-table joins | macOS · Win · Linux |
| 🔐 [BastionOrbit](https://slothlabs.org/bastionorbit) | SSH tunnel manager with auto-expiry TTL | macOS · Win · Linux |
| 🧜 [Mermaid Preview](https://slothlabs.org/mermaid-preview) | Mermaid IntelliJ / JetBrains plugin | All JetBrains IDEs |

---

## License

MIT © SlothLabs
