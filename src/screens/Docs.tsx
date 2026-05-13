import React from 'react'

export function Docs() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-text-primary font-display font-bold text-lg">Documentation</h1>
          <p className="text-text-muted text-xs mt-0.5">How to route traffic through ProxyOrbit — including corporate/MDM workarounds</p>
        </div>

        <div className="space-y-6 text-sm">
          <DocSection title="Quick Start">
            <ol className="list-decimal list-inside space-y-2 text-text-secondary text-[13px]">
              <li>Click <strong className="text-text-primary">Start</strong> in the sidebar.</li>
              <li>Enable <strong className="text-text-primary">Auto-configure system proxy</strong> in Settings so GUI apps (browsers, Postman, Slack) route through the proxy automatically.</li>
              <li>For CLI tools (curl, node, python, aws-cli), open a <em>new</em> terminal — <code className="text-primary font-mono">HTTPS_PROXY</code> is set on launchd so only newly-spawned processes pick it up.</li>
              <li>For full HTTPS request/response inspection, enable <strong className="text-text-primary">MITM HTTPS inspection</strong> in Settings and install the generated CA.</li>
            </ol>
          </DocSection>

          <DocSection title="Corporate / Zscaler / MDM environments">
            <p className="text-text-secondary text-[13px] mb-2">
              On managed Macs with Zscaler, Jamf, Crowdstrike, or similar MDM tooling, <code className="font-mono text-warning">networksetup -set*proxystate on</code>
              {' '}often silently no-ops — the command exits <code className="font-mono">0</code> but
              System Settings → Network still shows proxies disabled. You'll also typically find a
              forced <code className="font-mono">SSL_CERT_FILE=/…/ZscalerRootCA.pem</code> in your environment.
            </p>
            <p className="text-text-secondary text-[13px] mb-2">
              In this situation auto-configure can't persist the GUI proxy. Use one of these escape
              hatches instead:
            </p>
            <SubTitle>1. Per-shell aliases (recommended)</SubTitle>
            <p className="text-text-secondary text-[13px] mb-2">
              Add to <code className="font-mono">~/.zshrc</code> or <code className="font-mono">~/.bashrc</code> —
              you flip the proxy on/off in any terminal with <code className="font-mono text-primary">proxyon</code> / <code className="font-mono text-primary">proxyoff</code>:
            </p>
            <Code>{`# ProxyOrbit — CLI proxy toggle (zsh / bash)
export PROXYORBIT_CA="$HOME/.proxyorbit/ca/ca.pem"

proxyon() {
  export HTTPS_PROXY="http://127.0.0.1:8080"
  export HTTP_PROXY="http://127.0.0.1:8080"
  export ALL_PROXY="http://127.0.0.1:8080"
  export https_proxy="$HTTPS_PROXY"
  export http_proxy="$HTTP_PROXY"
  export all_proxy="$ALL_PROXY"
  # Trust ProxyOrbit's CA for the MITM leaf certs. If Zscaler already set
  # SSL_CERT_FILE, we stash it and restore it in proxyoff.
  [ -n "$SSL_CERT_FILE" ] && export SSL_CERT_FILE_PRE_PROXYORBIT="$SSL_CERT_FILE"
  export SSL_CERT_FILE="$PROXYORBIT_CA"
  export NODE_EXTRA_CA_CERTS="$PROXYORBIT_CA"
  export REQUESTS_CA_BUNDLE="$PROXYORBIT_CA"
  export CURL_CA_BUNDLE="$PROXYORBIT_CA"
  echo "ProxyOrbit: ON (127.0.0.1:8080)"
}

proxyoff() {
  unset HTTPS_PROXY HTTP_PROXY ALL_PROXY https_proxy http_proxy all_proxy \\
        NODE_EXTRA_CA_CERTS REQUESTS_CA_BUNDLE CURL_CA_BUNDLE
  if [ -n "$SSL_CERT_FILE_PRE_PROXYORBIT" ]; then
    export SSL_CERT_FILE="$SSL_CERT_FILE_PRE_PROXYORBIT"
    unset SSL_CERT_FILE_PRE_PROXYORBIT
  else
    unset SSL_CERT_FILE
  fi
  echo "ProxyOrbit: OFF"
}`}</Code>
            <SubTitle className="mt-4">2. Per-command with curl</SubTitle>
            <Code>{`curl --proxy http://127.0.0.1:8080 \\
     --cacert ~/.proxyorbit/ca/ca.pem \\
     https://api.example.com/endpoint`}</Code>

            <SubTitle className="mt-4">3. Manual GUI proxy (requires sudo, fails on locked MDM)</SubTitle>
            <Code>{`sudo networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080
sudo networksetup -setwebproxystate "Wi-Fi" on
sudo networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080
sudo networksetup -setsecurewebproxystate "Wi-Fi" on
# verify — if Enabled still shows No your MDM is blocking it
networksetup -getwebproxy "Wi-Fi"`}</Code>
          </DocSection>

          <DocSection title="App crashed and now my terminals can't reach the network">
            <p className="text-text-secondary text-[13px] mb-2">
              If ProxyOrbit is killed unexpectedly (panic, SIGKILL, OS shutdown
              before the cleanup hook runs), the launchd <code className="font-mono">HTTP_PROXY</code> /
              {' '}<code className="font-mono">HTTPS_PROXY</code> / <code className="font-mono">ALL_PROXY</code> env vars
              stay set and every new process tries to route through a dead
              <code className="font-mono"> 127.0.0.1:8080</code>.
            </p>
            <p className="text-text-secondary text-[13px] mb-2">
              Self-heal: just relaunch ProxyOrbit. On startup it detects
              orphaned proxy env vars and clears them automatically (see the
              console log line <code className="font-mono">cleaning orphaned HTTP_PROXY…</code>).
            </p>
            <p className="text-text-secondary text-[13px] mb-2">
              Manual fix from any terminal:
            </p>
            <pre className="p-3 rounded-lg bg-bg-surface border border-border font-mono text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">{`for k in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
  launchctl unsetenv "$k"
done
# Then quit and relaunch already-open terminals / IDEs.`}</pre>
            <p className="text-text-secondary text-[13px] mt-2">
              CA-trust env vars (<code className="font-mono">NODE_EXTRA_CA_CERTS</code>,{' '}
              <code className="font-mono">SSL_CERT_FILE</code>, etc.) are deliberately
              left in place when the app dies — they&apos;re additive, the
              referenced PEM file still exists on disk, and clearing them
              could push Node tools off whatever VPN/corporate trust chain
              you had layered.
            </p>
          </DocSection>

          <DocSection title="JetBrains / VSCode terminal doesn't pick up proxy">
            <p className="text-text-secondary text-[13px] mb-2">
              When the app is launched <em>before</em> ProxyOrbit starts, its embedded terminal
              inherits the old environment and doesn't see the <code className="font-mono">HTTPS_PROXY</code>
              {' '}values set by <code className="font-mono">launchctl setenv</code>. You can:
            </p>
            <ul className="list-disc list-inside space-y-1 text-text-secondary text-[13px]">
              <li>Quit and relaunch the IDE (picks up launchd env on next start), or</li>
              <li>Use the <strong className="text-text-primary">proxyon</strong> alias above inside the IDE terminal to set env for that shell, or</li>
              <li>Launch the IDE from a terminal that already has <code className="font-mono">proxyon</code> set (the child process inherits it).</li>
            </ul>
          </DocSection>

          <DocSection title="Configure individual tools">
            <SubTitle>VSCode</SubTitle>
            <p className="text-text-secondary text-[13px] mb-1">
              Settings → <code className="font-mono">http.proxy</code>: <code className="font-mono text-primary">http://127.0.0.1:8080</code>.
              For extensions that use Node: also set <code className="font-mono">NODE_EXTRA_CA_CERTS</code> in the environment before launching VSCode.
            </p>

            <SubTitle className="mt-3">IntelliJ / PyCharm / WebStorm / Rider</SubTitle>
            <p className="text-text-secondary text-[13px] mb-1">
              Settings → Appearance &amp; Behavior → System Settings → HTTP Proxy:
              <br/>Manual proxy configuration → Host name <code className="font-mono">127.0.0.1</code>, Port <code className="font-mono">8080</code>, check “Also use for HTTPS”.
              <br/>Under “Tools → Server Certificates”, accept the ProxyOrbit CA the first time a secure request is routed.
            </p>

            <SubTitle className="mt-3">Node.js</SubTitle>
            <Code>{`# .env or shell rc
NODE_EXTRA_CA_CERTS=~/.proxyorbit/ca/ca.pem
HTTPS_PROXY=http://127.0.0.1:8080
HTTP_PROXY=http://127.0.0.1:8080`}</Code>

            <SubTitle className="mt-3">Python (requests, httpx, urllib3)</SubTitle>
            <Code>{`export REQUESTS_CA_BUNDLE=~/.proxyorbit/ca/ca.pem
export HTTPS_PROXY=http://127.0.0.1:8080
export HTTP_PROXY=http://127.0.0.1:8080
# aiohttp / httpx honour the same env vars.`}</Code>

            <SubTitle className="mt-3">AWS CLI</SubTitle>
            <Code>{`export AWS_CA_BUNDLE=~/.proxyorbit/ca/ca.pem
export HTTPS_PROXY=http://127.0.0.1:8080`}</Code>

            <SubTitle className="mt-3">Go (net/http)</SubTitle>
            <Code>{`# net/http respects HTTPS_PROXY automatically.
# For the CA, append ProxyOrbit's CA to the system trust store or use:
export SSL_CERT_FILE=~/.proxyorbit/ca/ca.pem`}</Code>

            <SubTitle className="mt-3">Postman / Insomnia</SubTitle>
            <p className="text-text-secondary text-[13px]">
              Postman Settings → Proxy → “Use custom proxy configuration” → <code className="font-mono">127.0.0.1:8080</code>.
              Also disable “SSL certificate verification” (or add ProxyOrbit's CA under Certificates) — same for Insomnia.
            </p>

            <SubTitle className="mt-3">Docker containers</SubTitle>
            <Code>{`# containers can't reach host localhost directly — use host.docker.internal
docker run --rm \\
  -e HTTPS_PROXY=http://host.docker.internal:8080 \\
  -e HTTP_PROXY=http://host.docker.internal:8080 \\
  -v ~/.proxyorbit/ca/ca.pem:/usr/local/share/ca-certificates/proxyorbit.crt \\
  my-image`}</Code>
          </DocSection>

          <DocSection title="HTTPS body inspection (MITM)">
            <p className="text-text-secondary text-[13px] mb-2">
              Settings → HTTPS Inspection → toggle on. ProxyOrbit generates a local root CA in
              {' '}<code className="font-mono">~/.proxyorbit/ca/</code> and mints per-host leaf certs on the fly.
              Install the CA once:
            </p>
            <SubTitle>macOS</SubTitle>
            <Code>{`sudo security add-trusted-cert -d -r trustRoot \\
  -k /Library/Keychains/System.keychain ~/.proxyorbit/ca/ca.pem`}</Code>
            <SubTitle className="mt-3">Linux (Debian/Ubuntu)</SubTitle>
            <Code>{`sudo cp ~/.proxyorbit/ca/ca.pem /usr/local/share/ca-certificates/proxyorbit.crt
sudo update-ca-certificates`}</Code>
            <SubTitle className="mt-3">Windows (PowerShell, admin)</SubTitle>
            <Code>{`Import-Certificate -FilePath "$env:USERPROFILE\\.proxyorbit\\ca\\ca.pem" \`
  -CertStoreLocation Cert:\\LocalMachine\\Root`}</Code>
            <p className="text-text-secondary text-[13px] mt-3">
              Firefox maintains a separate trust store — import the PEM under
              {' '}Settings → Privacy &amp; Security → Certificates → View Certificates → Authorities → Import.
            </p>
          </DocSection>

          <DocSection title="Filters">
            <ul className="space-y-1 text-text-secondary text-[13px]">
              <li><strong className="text-text-primary">Text</strong> — URL / host / process</li>
              <li><strong className="text-text-primary">Method</strong> — GET, POST, PUT, PATCH, DELETE</li>
              <li><strong className="text-text-primary">Status</strong> — 2xx / 3xx / 4xx / 5xx / connection errors</li>
              <li><strong className="text-text-primary">Protocol</strong> — HTTP / HTTPS</li>
              <li><strong className="text-text-primary">Tunnels</strong> — toggle to show CONNECT tunnel handshakes (hidden by default; they're TLS setup noise, not API requests)</li>
            </ul>
          </DocSection>

          <DocSection title="Platform support">
            <ul className="space-y-1 text-text-secondary text-[13px]">
              <li><strong className="text-text-primary">macOS</strong> — full support: auto-configure system proxy, launchctl env vars, MITM CA</li>
              <li><strong className="text-text-primary">Windows</strong> — proxy listens; GUI auto-configure is macOS-only in v1.0. Set <code className="font-mono">HTTP_PROXY</code>/<code className="font-mono">HTTPS_PROXY</code> env vars or configure individual apps (see above)</li>
              <li><strong className="text-text-primary">Linux</strong> — proxy listens; same story as Windows. <code className="font-mono">.deb</code> bundles declare <code className="font-mono">libwebkit2gtk-4.1-0</code> runtime deps</li>
            </ul>
          </DocSection>
        </div>
      </div>
    </div>
  )
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-text-primary font-semibold text-sm mb-3 pb-1.5 border-b border-border-subtle">{title}</h2>
      {children}
    </div>
  )
}

function SubTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-text-primary font-semibold text-[12px] mb-1.5 ${className}`}>{children}</p>
}

function Code({ children }: { children: string }) {
  return (
    <pre className="p-3 rounded-lg bg-bg-surface border border-border font-mono text-[11px] text-text-secondary whitespace-pre-wrap break-all leading-relaxed">
      {children}
    </pre>
  )
}

export default Docs
