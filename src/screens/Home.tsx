import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ProxyEntry } from '@/types'
import { MethodBadge, StatusBadge, ProtocolBadge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

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
      style={{ gridTemplateColumns: '70px 52px 42px 1fr 60px 60px 80px 28px' }}
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

function DetailPanel({ entry, onClose }: { entry: ProxyEntry; onClose: () => void }) {
  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="w-80 flex-shrink-0 border-l border-border bg-bg-elevated flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-primary">Request Details</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Method + URL */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MethodBadge method={entry.method} />
            <ProtocolBadge isHttps={entry.is_https} />
            <StatusBadge status={entry.status} />
          </div>
          <p className="text-text-primary font-mono text-[11px] break-all leading-relaxed mt-2">{entry.url}</p>
        </div>

        {/* Stats */}
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

        {/* Details */}
        <div className="space-y-2">
          <DetailRow label="Host"      value={entry.host} />
          <DetailRow label="Path"      value={entry.path} />
          <DetailRow label="Timestamp" value={new Date(entry.timestamp).toISOString()} />
          <DetailRow label="ID"        value={entry.id} mono />
        </div>
      </div>
    </motion.div>
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
            style={{ gridTemplateColumns: '70px 52px 42px 1fr 60px 60px 80px 28px' }}
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
