export function Support() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-lg">
        <div className="mb-6">
          <h1 className="text-text-primary font-display font-bold text-lg">Support</h1>
          <p className="text-text-muted text-xs mt-0.5">Built with love by SlothLabs</p>
        </div>

        <div className="space-y-4">
          <div className="p-5 rounded-xl border border-border bg-bg-surface text-center">
            <div className="text-4xl mb-3">🦥</div>
            <h3 className="text-text-primary font-display font-bold text-base mb-1">ProxyOrbit</h3>
            <p className="text-text-muted text-xs mb-4">
              A lightweight desktop proxy inspector for developers.<br/>
              Intercept, inspect, and filter HTTP traffic from any app.
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              <span className="px-2 py-1 rounded-full bg-bg-overlay text-text-muted text-[10px] border border-border">
                Tauri v2
              </span>
              <span className="px-2 py-1 rounded-full bg-bg-overlay text-text-muted text-[10px] border border-border">
                React 18
              </span>
              <span className="px-2 py-1 rounded-full bg-bg-overlay text-text-muted text-[10px] border border-border">
                Rust
              </span>
              <span className="px-2 py-1 rounded-full bg-bg-overlay text-text-muted text-[10px] border border-border">
                tokio + hyper
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
            <div className="flex items-start gap-3">
              <span className="text-primary text-lg">💚</span>
              <div>
                <p className="text-text-primary text-sm font-semibold mb-1">Support SlothLabs</p>
                <p className="text-text-secondary text-xs leading-relaxed">
                  If you find ProxyOrbit useful, consider supporting development.
                  Every bit helps keep the sloths caffeinated.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center text-text-muted text-[11px] pt-2">
            ProxyOrbit v{__APP_VERSION__} · © 2026 SlothLabs
          </div>
        </div>
      </div>
    </div>
  )
}

export default Support
