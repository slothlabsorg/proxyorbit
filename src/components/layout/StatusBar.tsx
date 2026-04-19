import type { ProxyStatus } from '@/types'

interface StatusBarProps {
  proxyStatus: ProxyStatus | null
  entryCount: number
  filteredCount: number
}

export function StatusBar({ proxyStatus, entryCount, filteredCount }: StatusBarProps) {
  return (
    <div className="h-7 flex items-center justify-between px-4 border-t border-border-subtle bg-bg-base flex-shrink-0 select-none">
      <div className="flex items-center gap-4">
        {proxyStatus?.running ? (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_4px_rgba(74,222,128,0.8)]" />
            <span className="text-text-secondary text-[11px] font-medium">
              Intercepting on localhost:{proxyStatus.port}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-text-muted" />
            <span className="text-text-muted text-[11px]">Proxy stopped</span>
          </div>
        )}

        {proxyStatus?.system_proxy_set && (
          <span className="text-primary text-[11px]">● system proxy active</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {filteredCount !== entryCount && (
          <span className="text-text-muted text-[11px]">{filteredCount} / {entryCount} requests</span>
        )}
        {filteredCount === entryCount && (
          <span className="text-text-muted text-[11px]">{entryCount} requests</span>
        )}
        <span className="text-text-muted text-[11px]">ProxyOrbit v0.1.0</span>
      </div>
    </div>
  )
}

export default StatusBar
