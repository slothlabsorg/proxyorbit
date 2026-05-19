import React from 'react'
import type { ProxyStatus } from '@/types'
import { ProxyStatusDot } from '@/components/ui/Badge'
import { NewsBell } from '@/components/ui/NewsBell'
import { getCurrentWindow } from '@tauri-apps/api/window'

type BellItem = { id: string; kind: 'update-available' | 'release' | 'announcement'; title: string; body?: string; date: string; url?: string }

interface TitlebarProps {
  proxyStatus: ProxyStatus | null
  bellItems?: BellItem[]
  newsUnread?: number
  onNewsMarkRead?: () => void
  onTriggerUpdate?: () => void
  showUpdateBanner?: boolean
  updateVersion?: string
}

// `data-tauri-drag-region` + CSS `-webkit-app-region: drag` aren't reliable
// on Tauri 2 macOS with `titleBarStyle: Overlay` — the CSS prop is a no-op
// on WebKit and the DOM handler sometimes loses binding. Same failure mode
// we hit in cloudorbit; same fix: call `startDragging()` explicitly on
// mousedown. Interactive children (button/a/input) are filtered so clicks
// on the status badge still work.
function startDragOnMouseDown(e: React.MouseEvent) {
  if (e.button !== 0) return
  const t = e.target as HTMLElement
  if (t.closest('button, a, input, select, textarea, [role="button"]')) return
  try { void getCurrentWindow().startDragging() } catch { /* not in Tauri */ }
}

function AppLogo() {
  const [failed, setFailed] = React.useState(false)
  if (failed) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary">
        <circle cx="12" cy="12" r="3" fill="currentColor"/>
        <ellipse cx="12" cy="12" rx="10" ry="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
        <ellipse cx="12" cy="12" rx="4.5" ry="10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="3 2" opacity="0.5"/>
      </svg>
    )
  }
  return (
    <img
      src="/images/proxyorbit-icon.png"
      alt="ProxyOrbit"
      width={22} height={22}
      className="rounded-md object-cover flex-shrink-0"
      onError={() => setFailed(true)}
    />
  )
}

export function Titlebar({
  proxyStatus,
  bellItems = [],
  newsUnread = 0,
  onNewsMarkRead,
  onTriggerUpdate,
  showUpdateBanner = false,
  updateVersion = '',
}: TitlebarProps) {
  const runStatus = proxyStatus?.running ? 'running' : 'stopped'

  return (
    <div
      data-tauri-drag-region
      onMouseDown={startDragOnMouseDown}
      className="h-12 flex items-center px-4 border-b border-border-subtle bg-bg-base flex-shrink-0 select-none"
      style={{ paddingLeft: '80px' }}
    >
      {/* Center — brand */}
      <div className="flex-1 flex items-center justify-center gap-2">
        <AppLogo />
        <span className="font-display font-bold text-text-primary text-sm tracking-wide">ProxyOrbit</span>
      </div>

      {/* Right — news bell + update banner + proxy status */}
      <div className="flex items-center gap-2">
        {showUpdateBanner && (
          <button
            data-testid="update-banner"
            onClick={onTriggerUpdate}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-semibold hover:bg-primary/25 transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l8 8h-5v8H9v-8H4z"/></svg>
            v{updateVersion}
          </button>
        )}

        <NewsBell
          items={bellItems}
          unreadCount={newsUnread}
          loading={false}
          onMarkAllRead={onNewsMarkRead ?? (() => {})}
          onTriggerUpdate={onTriggerUpdate}
        />

        <div className="flex items-center gap-1.5">
          {proxyStatus ? (
            <>
              <ProxyStatusDot status={runStatus} />
              <span className="text-text-muted text-xs">
                {proxyStatus.running ? `localhost:${proxyStatus.port}` : 'stopped'}
              </span>
            </>
          ) : (
            <span className="text-text-muted text-xs">initializing…</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default Titlebar
