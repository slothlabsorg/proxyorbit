import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { InterceptPayload, HeaderList } from '@/types'
import Button from './Button'

interface Props {
  payload: InterceptPayload | null
  /** Called when the user resolves the intercept — `null` body on drop. */
  onRelease: (decision:
    | { id: string; action: 'forward'; method: string; url: string; headers: HeaderList; body: string }
    | { id: string; action: 'drop' }
  ) => void
}

/**
 * Modal shown when the proxy pauses a request for interception. The user can
 * edit method, URL, headers, and body then choose Forward, Drop, or
 * Forward unmodified. Closes automatically once the decision is released.
 *
 * If multiple intercepts queue up (user toggled intercepting while many
 * requests in-flight), we only show the oldest one — after release, the
 * parent pulls the next from its queue.
 */
export function InterceptModal({ payload, onRelease }: Props) {
  const [method, setMethod] = useState('')
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [body, setBody] = useState('')

  // Hydrate editable state when a new payload arrives.
  useEffect(() => {
    if (!payload) return
    setMethod(payload.method)
    setUrl(payload.url)
    setHeadersText(payload.headers.map(([k, v]) => `${k}: ${v}`).join('\n'))
    setBody(payload.body ?? '')
  }, [payload?.id])

  if (!payload) return null

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

  const forwardModified = () => {
    onRelease({
      id: payload.id,
      action: 'forward',
      method, url,
      headers: parseHeaders(),
      body,
    })
  }

  const forwardUnmodified = () => {
    onRelease({
      id: payload.id,
      action: 'forward',
      method: payload.method,
      url: payload.url,
      headers: payload.headers,
      body: payload.body ?? '',
    })
  }

  const drop = () => onRelease({ id: payload.id, action: 'drop' })

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          key="modal"
          className="bg-bg-elevated border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          initial={{ scale: 0.95, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 8 }}
        >
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              <div>
                <p className="text-xs font-semibold text-text-primary">Intercepted request</p>
                <p className="text-[10px] text-text-muted">Edit and forward, or drop to return 444 to the client.</p>
              </div>
            </div>
            <span className="text-[10px] text-text-muted font-mono">id: {payload.id.slice(0, 8)}…</span>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3 text-[11px]">
            <div className="flex gap-2">
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="bg-bg-surface border border-border rounded px-2 py-1.5 text-[12px] font-mono"
              >
                {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="flex-1 bg-bg-surface border border-border rounded px-2 py-1.5 text-[12px] font-mono text-text-primary outline-none focus:border-border-focus"
              />
            </div>

            <div>
              <label className="text-text-muted text-[10px] font-semibold uppercase tracking-wider block mb-1">Headers</label>
              <textarea
                value={headersText}
                onChange={e => setHeadersText(e.target.value)}
                rows={6}
                spellCheck={false}
                className="w-full bg-bg-surface border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary outline-none focus:border-border-focus resize-y"
              />
            </div>

            <div>
              <label className="text-text-muted text-[10px] font-semibold uppercase tracking-wider block mb-1">Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full bg-bg-surface border border-border rounded px-2 py-1.5 text-[11px] font-mono text-text-primary outline-none focus:border-border-focus resize-y"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between bg-bg-base">
            <button
              onClick={drop}
              className="text-[11px] text-danger hover:text-red-400 transition-colors font-medium"
              title="Return 444 to the client without forwarding"
            >
              Drop
            </button>
            <div className="flex gap-2">
              <Button onClick={forwardUnmodified}>Forward unmodified</Button>
              <Button onClick={forwardModified} variant="primary">Forward modified</Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default InterceptModal
