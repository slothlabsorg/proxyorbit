export type ProxyRunStatus = 'running' | 'stopped' | 'starting' | 'error'

export function MethodBadge({ method }: { method: string }) {
  const map: Record<string, string> = {
    GET:     'bg-info/10 text-info border-info/25',
    POST:    'bg-success/10 text-success border-success/25',
    PUT:     'bg-warning/10 text-warning border-warning/25',
    PATCH:   'bg-warning/10 text-warning border-warning/25',
    DELETE:  'bg-danger/10 text-danger border-danger/25',
    HEAD:    'bg-text-muted/10 text-text-muted border-text-muted/25',
    OPTIONS: 'bg-text-muted/10 text-text-muted border-text-muted/25',
    CONNECT: 'bg-primary/10 text-primary border-primary/25',
  }
  const cls = map[method.toUpperCase()] ?? 'bg-bg-surface text-text-muted border-border'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider ${cls}`}>
      {method.toUpperCase()}
    </span>
  )
}

export function StatusBadge({ status }: { status: number | null }) {
  if (status === null) {
    return <span className="text-text-muted text-[11px]">—</span>
  }
  const cls =
    status >= 500 ? 'text-danger' :
    status >= 400 ? 'text-warning' :
    status >= 300 ? 'text-info' :
    status >= 200 ? 'text-success' :
    'text-text-muted'
  return <span className={`text-[11px] font-mono font-semibold ${cls}`}>{status}</span>
}

export function ProxyStatusDot({ status }: { status: ProxyRunStatus }) {
  const map: Record<ProxyRunStatus, string> = {
    running:  'bg-success shadow-[0_0_6px_rgba(74,222,128,0.6)]',
    stopped:  'bg-text-muted',
    starting: 'bg-warning animate-pulse',
    error:    'bg-danger',
  }
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${map[status]}`} />
}

export function ProtocolBadge({ isHttps }: { isHttps: boolean }) {
  return (
    <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold border ${
      isHttps ? 'bg-primary/8 text-primary border-primary/20' : 'bg-bg-surface text-text-muted border-border'
    }`}>
      {isHttps ? 'HTTPS' : 'HTTP'}
    </span>
  )
}
