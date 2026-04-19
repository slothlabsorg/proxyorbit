export function Docs() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-text-primary font-display font-bold text-lg">Documentation</h1>
          <p className="text-text-muted text-xs mt-0.5">Learn how to use ProxyOrbit</p>
        </div>

        <div className="space-y-6 text-sm">
          <DocSection title="Quick Start">
            <ol className="list-decimal list-inside space-y-2 text-text-secondary text-[13px]">
              <li>Click <strong className="text-text-primary">Start</strong> in the sidebar to launch the proxy.</li>
              <li>Enable <strong className="text-text-primary">Auto-configure system proxy</strong> in Settings to route all traffic automatically.</li>
              <li>Or manually set your app's proxy to <code className="text-primary font-mono">127.0.0.1:8080</code></li>
              <li>Traffic will appear in real-time in the Capture view.</li>
            </ol>
          </DocSection>

          <DocSection title="HTTPS Interception">
            <p className="text-text-secondary text-[13px]">
              ProxyOrbit intercepts HTTPS CONNECT tunnels and logs the host, timing, and size.
              For full request/response inspection you would need to install a custom CA certificate.
            </p>
            <div className="mt-3 p-3 rounded-lg bg-bg-surface border border-border">
              <p className="text-text-muted text-[11px] font-mono">
                # The proxy listens on localhost:8080<br/>
                # Set your system proxy in System Settings → Network → Proxies<br/>
                # Or use the auto-configure option in Settings
              </p>
            </div>
          </DocSection>

          <DocSection title="Manual System Proxy">
            <p className="text-text-secondary text-[13px] mb-2">To manually configure macOS:</p>
            <div className="p-3 rounded-lg bg-bg-surface border border-border font-mono text-[11px] text-text-muted space-y-1">
              <p># HTTP proxy</p>
              <p>networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080</p>
              <p>networksetup -setwebproxystate "Wi-Fi" on</p>
              <p className="mt-2"># HTTPS proxy</p>
              <p>networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080</p>
              <p>networksetup -setsecurewebproxystate "Wi-Fi" on</p>
              <p className="mt-2"># To disable</p>
              <p>networksetup -setwebproxystate "Wi-Fi" off</p>
              <p>networksetup -setsecurewebproxystate "Wi-Fi" off</p>
            </div>
          </DocSection>

          <DocSection title="Filters">
            <p className="text-text-secondary text-[13px]">
              Use the filter bar to narrow down requests:
            </p>
            <ul className="mt-2 space-y-1 text-text-secondary text-[13px]">
              <li><span className="text-text-primary font-medium">Text</span> — filter by URL, host, or process name</li>
              <li><span className="text-text-primary font-medium">Method</span> — GET, POST, PUT, PATCH, DELETE</li>
              <li><span className="text-text-primary font-medium">Status</span> — 2xx, 3xx, 4xx, 5xx, or connection errors</li>
              <li><span className="text-text-primary font-medium">Protocol</span> — HTTP or HTTPS</li>
            </ul>
          </DocSection>

          <DocSection title="Keyboard Shortcuts">
            <div className="space-y-1 text-[13px]">
              {[
                ['Click row',  'Open request details'],
                ['× button',   'Delete request'],
                ['Clear all',  'Remove all captured requests'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="px-2 py-0.5 rounded bg-bg-surface border border-border text-text-primary text-[11px] font-mono min-w-[80px] text-center">{key}</kbd>
                  <span className="text-text-secondary">{desc}</span>
                </div>
              ))}
            </div>
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

import React from 'react'

export default Docs
