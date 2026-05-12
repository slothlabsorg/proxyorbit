import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ProxyEntry, HeaderList, ReplayResult } from '@/types'
import { MethodBadge, StatusBadge, ProtocolBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { toCurl, prettyBody } from '@/lib/curl'
import { api } from '@/lib/tauri'

interface HomeProps {
  entries: ProxyEntry[]
  isRunning: boolean
  onClear: () => void
  onDelete: (id: string) => void
  onStartProxy: () => void
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`
  return `${(b / 1024 / 1024).toFixed(1)}MB`
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toTimeString().slice(0, 8)
}

function truncateUrl(url: string, max = 72): string {
  if (url.length <= max) return url
  return url.slice(0, max) + '…'
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

interface FilterState {
  text: string
  method: string
  statusFilter: 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'err'
  protocol: 'all' | 'http' | 'https'
  // CONNECT entries are TLS tunnel handshakes, not real API calls. They're
  // noisy when MITM is off (every HTTPS request generates one) and confuse
  // the method/status filters. Hidden by default; user can toggle on.
  showTunnels: boolean
}

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: '2xx', value: '2xx' },
  { label: '3xx', value: '3xx' },
  { label: '4xx', value: '4xx' },
  { label: '5xx', value: '5xx' },
  { label: 'Err', value: 'err' },
] as const

const METHOD_OPTIONS = ['All', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE']

function FilterBar({ filter, onChange }: { filter: FilterState; onChange: (f: FilterState) => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-elevated flex-wrap">
      {/* Text filter */}
      <div className="relative flex-1 min-w-40">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="w-full bg-bg-surface border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-border-focus transition-colors"
          placeholder="Filter by URL, host, process…"
          value={filter.text}
          onChange={e => onChange({ ...filter, text: e.target.value })}
        />
      </div>

      {/* Method filter */}
      <div className="flex items-center gap-1">
        {METHOD_OPTIONS.map(m => (
          <button
            key={m}
            onClick={() => onChange({ ...filter, method: m === 'All' ? '' : m })}
            className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
              (m === 'All' && !filter.method) || filter.method === m
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-surface border border-transparent'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.value}
            onClick={() => onChange({ ...filter, statusFilter: s.value })}
            className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
              filter.statusFilter === s.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-surface border border-transparent'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Protocol filter */}
      <div className="flex items-center gap-1">
        {(['all', 'https', 'http'] as const).map(p => (
          <button
            key={p}
            onClick={() => onChange({ ...filter, protocol: p })}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${
              filter.protocol === p
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-surface border border-transparent'
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Show tunnels toggle — off by default so CONNECT noise doesn't
          crowd the list. On reveals the TLS handshake entries too. */}
      <button
        onClick={() => onChange({ ...filter, showTunnels: !filter.showTunnels })}
        className={`px-2 py-1 rounded text-[10px] transition-colors ${
          filter.showTunnels
            ? 'bg-primary/15 text-primary border border-primary/30'
            : 'text-text-muted hover:text-text-secondary hover:bg-bg-surface border border-transparent'
        }`}
        title="Show CONNECT tunnel handshakes (usually hidden — noisy when MITM is off)"
      >
        Tunnels
      </button>
    </div>
  )
}

// ── Request row ────────────────────────────────────────────────────────────────

function RequestRow({
  entry,
  isSelected,
  onSelect,
  onDelete,
}: {
  entry: ProxyEntry
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onClick={onSelect}
      className={`grid items-center text-xs border-b border-border-subtle cursor-pointer transition-colors group ${
        isSelected ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-bg-surface border-l-2 border-l-transparent'
      }`}
      style={{ gridTemplateColumns: '70px 88px 60px 1fr 60px 60px 80px 28px' }}
    >
      {/* Time */}
      <span className="px-2 py-2 text-text-muted font-mono text-[10px] whitespace-nowrap">
        {formatTime(entry.timestamp)}
      </span>
      {/* Method */}
      <span className="px-1 py-2">
        <MethodBadge method={entry.method} />
      </span>
      {/* Protocol */}
      <span className="px-1 py-2">
        <ProtocolBadge isHttps={entry.is_https} />
      </span>
      {/* URL */}
      <span className="px-2 py-2 text-text-primary truncate font-mono text-[11px]">
        {truncateUrl(entry.host + entry.path)}
      </span>
      {/* Status */}
      <span className="px-2 py-2 text-right">
        <StatusBadge status={entry.status} />
      </span>
      {/* Duration */}
      <span className="px-2 py-2 text-text-muted font-mono text-[10px] text-right">
        {formatMs(entry.duration_ms)}
      </span>
      {/* Process */}
      <span className="px-2 py-2 text-text-muted text-[10px] truncate">
        {entry.process ?? '—'}
      </span>
      {/* Delete */}
      <span className="px-1 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="text-text-muted hover:text-danger transition-colors p-0.5 rounded"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </span>
    </motion.div>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'headers' | 'body' | 'replay'

function DetailPanel({ entry, onClose }: { entry: ProxyEntry; onClose: () => void }) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [curlCopied, setCurlCopied] = useState(false)

  // Reset to overview when the selected entry changes so the panel doesn't
  // show a stale tab (e.g. body viewer empty because the previous entry
  // had a body but this one doesn't).
  useEffect(() => { setTab('overview') }, [entry.id])

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(toCurl(entry))
      setCurlCopied(true)
      setTimeout(() => setCurlCopied(false), 1500)
    } catch { /* clipboard denied */ }
  }

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'headers',  label: 'Headers' },
    { id: 'body',     label: 'Body' },
    { id: 'replay',   label: 'Replay' },
  ]

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="w-[420px] flex-shrink-0 border-l border-border bg-bg-elevated flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-primary">Request Details</span>
        <div className="flex items-center gap-1">
          <button
            onClick={copyCurl}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors border border-border"
            title="Copy as cURL command"
          >
            {curlCopied ? (
              <>
                <svg className="w-3 h-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1 -2 -2V4a2 2 0 0 1 2 -2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy as cURL
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Summary line (always visible above tabs) */}
      <div className="px-4 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 mb-1">
          <MethodBadge method={entry.method} />
          <ProtocolBadge isHttps={entry.is_https} />
          <StatusBadge status={entry.status} />
          {entry.kind === 'connect' && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg-surface text-text-muted border border-border">tunnel</span>
          )}
        </div>
        <p className="text-text-primary font-mono text-[11px] break-all leading-relaxed">{entry.url}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle bg-bg-base flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 text-[11px] font-medium transition-colors border-b-2 ${
              tab === t.id
                ? 'text-primary border-primary'
                : 'text-text-muted hover:text-text-secondary border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && <OverviewTab entry={entry} />}
        {tab === 'headers'  && <HeadersTab entry={entry} />}
        {tab === 'body'     && <BodyTab entry={entry} />}
        {tab === 'replay'   && <ReplayTab entry={entry} />}
      </div>
    </motion.div>
  )
}

function OverviewTab({ entry }: { entry: ProxyEntry }) {
  return (
    <div className="p-4 space-y-4 text-xs">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Duration', value: formatMs(entry.duration_ms) },
          { label: 'Req Size', value: formatBytes(entry.request_size) },
          { label: 'Res Size', value: formatBytes(entry.response_size) },
          { label: 'Process',  value: entry.process ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-bg-surface rounded-lg p-2">
            <p className="text-text-muted text-[10px] mb-0.5">{label}</p>
            <p className="text-text-primary font-mono text-[11px] truncate">{value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <DetailRow label="Host"      value={entry.host} />
        <DetailRow label="Path"      value={entry.path} />
        <DetailRow label="Timestamp" value={new Date(entry.timestamp).toISOString()} />
        <DetailRow label="Kind"      value={entry.kind} mono />
        <DetailRow label="ID"        value={entry.id} mono />
      </div>
      {entry.kind === 'connect' && (
        <div className="bg-bg-surface border border-border rounded-lg p-3 text-[11px] text-text-muted leading-relaxed">
          HTTPS tunnel — headers and body are end-to-end encrypted and not
          captured. Inspection requires a MITM CA trust, planned for v1.1.
        </div>
      )}
    </div>
  )
}

function HeadersTab({ entry }: { entry: ProxyEntry }) {
  return (
    <div className="p-4 space-y-4 text-[11px]">
      <HeadersSection title="Request Headers"  headers={entry.request_headers}  />
      <HeadersSection title="Response Headers" headers={entry.response_headers} />
    </div>
  )
}

function HeadersSection({ title, headers }: { title: string; headers: HeaderList }) {
  const [copied, setCopied] = useState(false)
  const copyAll = async () => {
    const text = headers.map(([k, v]) => `${k}: ${v}`).join('\n')
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* denied */ }
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-text-muted text-[10px] font-semibold uppercase tracking-wider">{title}</p>
        {headers.length > 0 && (
          <button
            onClick={copyAll}
            className="text-[10px] text-text-muted hover:text-primary transition-colors"
            title="Copy all"
          >
            {copied ? 'Copied' : 'Copy all'}
          </button>
        )}
      </div>
      {headers.length === 0 ? (
        <p className="text-text-muted/60 text-[11px] italic py-1">No headers captured.</p>
      ) : (
        <div className="bg-bg-surface rounded-lg border border-border-subtle divide-y divide-border-subtle">
          {headers.map(([k, v], i) => (
            <div key={i} className="flex gap-2 px-2.5 py-1.5">
              <span className="text-text-secondary font-mono text-[11px] flex-shrink-0 min-w-20">{k}</span>
              <span className="text-text-primary font-mono text-[11px] break-all">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BodyTab({ entry }: { entry: ProxyEntry }) {
  return (
    <div className="p-4 space-y-4">
      <BodySection
        title="Request Body"
        body={entry.request_body}
        truncated={entry.request_body_truncated}
      />
      <BodySection
        title="Response Body"
        body={entry.response_body}
        truncated={entry.response_body_truncated}
      />
    </div>
  )
}

function BodySection({ title, body, truncated }: { title: string; body: string | null; truncated: boolean }) {
  const [expanded, setExpanded] = useState(true)
  const [copied, setCopied] = useState(false)
  const { text, language } = prettyBody(body)

  const copy = async () => {
    if (!text) return
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* denied */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-text-muted text-[10px] font-semibold uppercase tracking-wider hover:text-text-primary transition-colors"
        >
          <svg className={`w-2.5 h-2.5 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
          {title}
          {language !== 'empty' && (
            <span className={`ml-1.5 text-[9px] font-normal normal-case tracking-normal px-1 py-0.5 rounded ${
              language === 'json' ? 'bg-primary/10 text-primary' :
              language === 'binary' ? 'bg-warning/10 text-warning' :
              'bg-bg-surface text-text-muted'
            }`}>{language}</span>
          )}
          {truncated && (
            <span className="ml-1 text-[9px] font-normal normal-case tracking-normal text-warning">truncated</span>
          )}
        </button>
        {text && (
          <button onClick={copy} className="text-[10px] text-text-muted hover:text-primary transition-colors">
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {expanded && (
        language === 'empty' ? (
          <p className="text-text-muted/60 text-[11px] italic py-1">Empty.</p>
        ) : (
          <pre className={`bg-bg-surface rounded-lg border border-border-subtle p-2.5 text-[11px] font-mono whitespace-pre-wrap break-all max-h-[280px] overflow-auto ${
            language === 'binary' ? 'text-warning/80' : 'text-text-primary'
          }`}>{text}</pre>
        )
      )}
    </div>
  )
}

function ReplayTab({ entry }: { entry: ProxyEntry }) {
  // Local editable copy of method/url/headers/body. Initialised from the
  // entry; changes don't affect the captured entry in the log.
  const [method, setMethod]     = useState(entry.method)
  const [url, setUrl]           = useState(entry.url)
  const [headersText, setHeadersText] = useState(
    entry.request_headers.map(([k, v]) => `${k}: ${v}`).join('\n'),
  )
  const [body, setBody]         = useState(entry.request_body ?? '')
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<ReplayResult | null>(null)
  const [error, setError]       = useState<string | null>(null)

  // Reset the editable state when the selected entry changes.
  useEffect(() => {
    setMethod(entry.method)
    setUrl(entry.url)
    setHeadersText(entry.request_headers.map(([k, v]) => `${k}: ${v}`).join('\n'))
    setBody(entry.request_body ?? '')
    setResult(null)
    setError(null)
  }, [entry.id])

  const parseHeaders = (): HeaderList => {
    const out: HeaderList = []
    for (const line of headersText.split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k) out.push([k, v])
    }
    return out
  }

  const send = async () => {
    setSending(true); setError(null); setResult(null)
    try {
      const r = await api.replayRequest({
        method, url,
        headers: parseHeaders(),
        body: body || null,
      })
      setResult(r)
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 space-y-3 text-[11px]">
      <p className="text-text-muted text-[10px] leading-relaxed">
        Edit and re-send the request. Runs outside the capture log —
        results show here inline.
      </p>

      <div className="flex gap-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="bg-bg-surface border border-border rounded px-2 py-1 text-[11px] font-mono"
        >
          {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          className="flex-1 bg-bg-surface border border-border rounded px-2 py-1 text-[11px] font-mono text-text-primary outline-none focus:border-border-focus"
        />
      </div>

      <div>
        <label className="text-text-muted text-[10px] font-semibold uppercase tracking-wider block mb-1">Headers</label>
        <textarea
          value={headersText}
          onChange={e => setHeadersText(e.target.value)}
          rows={5}
          spellCheck={false}
          className="w-full bg-bg-surface border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary outline-none focus:border-border-focus resize-y"
          placeholder="Accept: application/json"
        />
      </div>

      <div>
        <label className="text-text-muted text-[10px] font-semibold uppercase tracking-wider block mb-1">Body</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={4}
          spellCheck={false}
          className="w-full bg-bg-surface border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary outline-none focus:border-border-focus resize-y"
          placeholder="Request body…"
        />
      </div>

      <Button onClick={send} disabled={sending}>
        {sending ? 'Sending…' : 'Send'}
      </Button>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded p-2 text-danger text-[11px] font-mono whitespace-pre-wrap break-all">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
            <StatusBadge status={result.status} />
            <span className="text-text-muted text-[11px] font-mono">{result.duration_ms}ms</span>
            {result.error && (
              <span className="text-danger text-[11px]">error: {result.error}</span>
            )}
          </div>
          <HeadersSection title="Response Headers" headers={result.response_headers} />
          <BodySection title="Response Body" body={result.response_body} truncated={result.response_body_truncated} />
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-text-muted w-20 flex-shrink-0 text-[10px] pt-0.5">{label}</span>
      <span className={`text-text-secondary text-[11px] break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// ── Home screen ────────────────────────────────────────────────────────────────

export function Home({ entries, isRunning, onClear, onDelete, onStartProxy }: HomeProps) {
  const [filter, setFilter] = useState<FilterState>({
    text: '',
    method: '',
    statusFilter: 'all',
    protocol: 'all',
    showTunnels: false,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries.length, autoScroll])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      // Hide CONNECT tunnel entries unless explicitly toggled on — they're
      // TLS setup noise, not user-initiated API calls.
      if (!filter.showTunnels && e.kind === 'connect') return false
      if (filter.method && e.method.toUpperCase() !== filter.method) return false
      if (filter.protocol === 'https' && !e.is_https) return false
      if (filter.protocol === 'http' && e.is_https) return false
      if (filter.statusFilter !== 'all') {
        if (filter.statusFilter === 'err' && e.status !== null) return false
        if (filter.statusFilter === '2xx' && (e.status === null || e.status < 200 || e.status >= 300)) return false
        if (filter.statusFilter === '3xx' && (e.status === null || e.status < 300 || e.status >= 400)) return false
        if (filter.statusFilter === '4xx' && (e.status === null || e.status < 400 || e.status >= 500)) return false
        if (filter.statusFilter === '5xx' && (e.status === null || e.status < 500)) return false
      }
      if (filter.text) {
        const q = filter.text.toLowerCase()
        if (
          !e.url.toLowerCase().includes(q) &&
          !e.host.toLowerCase().includes(q) &&
          !(e.process ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [entries, filter])

  const selected = entries.find(e => e.id === selectedId) ?? null

  if (entries.length === 0 && !isRunning) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          variant="welcome"
          title="ProxyOrbit"
          description="Start the proxy to intercept HTTP and HTTPS traffic from any app on your machine."
          action={{ label: '⚡ Start Proxy', onClick: onStartProxy }}
        />
      </div>
    )
  }

  if (entries.length === 0 && isRunning) {
    return (
      <div className="h-full flex flex-col">
        <FilterBar filter={filter} onChange={setFilter} />
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            variant="intercepting"
            title="Intercepting traffic…"
            description="Make any HTTP request and it will appear here in real time."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <FilterBar filter={filter} onChange={setFilter} />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-base flex-shrink-0">
        <span className="text-[11px] text-text-muted flex-1">
          {filtered.length !== entries.length
            ? `${filtered.length} / ${entries.length} requests`
            : `${entries.length} requests`}
        </span>
        <button
          onClick={() => setAutoScroll(a => !a)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            autoScroll ? 'border-primary/30 text-primary bg-primary/8' : 'border-border text-text-muted hover:text-text-secondary'
          }`}
        >
          ↓ Auto-scroll
        </button>
        <Button variant="ghost" size="xs" onClick={onClear}>Clear all</Button>
      </div>

      {/* Table */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column headers */}
          <div
            className="grid text-[10px] font-semibold text-text-muted uppercase tracking-wider px-0 py-1.5 border-b border-border bg-bg-elevated flex-shrink-0"
            style={{ gridTemplateColumns: '70px 88px 60px 1fr 60px 60px 80px 28px' }}
          >
            <span className="px-2">Time</span>
            <span className="px-1">Method</span>
            <span className="px-1">Proto</span>
            <span className="px-2">URL</span>
            <span className="px-2 text-right">Status</span>
            <span className="px-2 text-right">Time</span>
            <span className="px-2">Process</span>
            <span />
          </div>

          {/* Rows */}
          <div ref={listRef} className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-text-muted text-xs">
                No matching requests
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {filtered.map(entry => (
                  <RequestRow
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedId}
                    onSelect={() => setSelectedId(id => id === entry.id ? null : entry.id)}
                    onDelete={() => { onDelete(entry.id); if (selectedId === entry.id) setSelectedId(null) }}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selected && (
            <DetailPanel
              entry={selected}
              onClose={() => setSelectedId(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default Home
