import { useEffect, useState } from 'react'
import type { RewriteRule, RuleAction } from '@/types'
import Button from '@/components/ui/Button'
import { api } from '@/lib/tauri'
import { mockRewriteRules } from '@/mock/data'

const URL_MOCK = new URL(window.location.href).searchParams.get('mock') === '1'

const ACTION_LABELS: Record<RuleAction['type'], string> = {
  serve_local_file: 'Serve local file',
  rewrite_response_body: 'Rewrite response body',
  rewrite_request_body: 'Rewrite request body',
  mock_response: 'Mock response',
  redirect: 'Redirect',
}

function actionSummary(a: RuleAction): string {
  switch (a.type) {
    case 'serve_local_file': return a.path
    case 'redirect': return `→ ${a.to_url}`
    case 'mock_response': return `${a.status} (${a.body.length} bytes)`
    case 'rewrite_response_body':
    case 'rewrite_request_body':
      return a.replacements.map(([f, t]) => `${f} → ${t}`).join(', ')
  }
}

export function Rules() {
  const [rules, setRules] = useState<RewriteRule[]>(URL_MOCK ? mockRewriteRules : [])
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState<RewriteRule | null>(null)

  useEffect(() => {
    if (URL_MOCK) return
    api.getRewriteRules().then(setRules).catch(() => {})
  }, [])

  async function persist(next: RewriteRule[]) {
    setRules(next)
    if (!URL_MOCK) await api.setRewriteRules(next).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function toggle(id: string) {
    persist(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }

  function remove(id: string) {
    persist(rules.filter(r => r.id !== id))
  }

  function addBlank() {
    const rule: RewriteRule = {
      id: `rule-${Date.now()}`,
      name: 'New rule',
      enabled: false,
      match: { method: null, host: '', path_contains: '', url_regex: null },
      action: { type: 'serve_local_file', path: '', content_type: null },
    }
    setEditing(rule)
  }

  function saveEdit(rule: RewriteRule) {
    const exists = rules.some(r => r.id === rule.id)
    const next = exists ? rules.map(r => r.id === rule.id ? rule : r) : [...rules, rule]
    persist(next)
    setEditing(null)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-3xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-text-primary font-display font-bold text-lg">Rewrite Rules</h1>
            <p className="text-text-muted text-xs mt-0.5">
              Inject local plugin builds, rewrite backend responses, mock or redirect requests.
              Requires HTTPS MITM enabled in Settings for https:// targets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-accent text-xs" data-testid="rules-saved">Saved</span>}
            <Button onClick={addBlank} data-testid="add-rule">+ Add rule</Button>
          </div>
        </div>

        <div className="space-y-2" data-testid="rules-list">
          {rules.length === 0 && (
            <div className="text-text-muted text-xs text-center py-8 border border-dashed border-border rounded">
              No rules yet. Click "Add rule" or the presets appear here on first launch.
            </div>
          )}
          {rules.map(rule => (
            <div
              key={rule.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded border border-border bg-bg-elevated"
              data-testid={`rule-${rule.id}`}
            >
              <button
                onClick={() => toggle(rule.id)}
                className={`w-9 h-5 rounded-full flex-shrink-0 transition-colors ${rule.enabled ? 'bg-accent' : 'bg-border'}`}
                data-testid={`toggle-${rule.id}`}
                title={rule.enabled ? 'Enabled' : 'Disabled'}
              >
                <span className={`block w-4 h-4 bg-white rounded-full transform transition-transform ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="text-text-primary text-sm font-medium truncate">{rule.name}</div>
                <div className="text-text-muted text-xs truncate">
                  <span className="text-accent">{ACTION_LABELS[rule.action.type]}</span>
                  {' · '}
                  {rule.match.method ? `${rule.match.method} ` : ''}
                  {rule.match.host || 'any host'}
                  {rule.match.path_contains ? ` · ${rule.match.path_contains}` : ''}
                </div>
                <div className="text-text-muted text-[11px] truncate opacity-70">{actionSummary(rule.action)}</div>
              </div>

              <button onClick={() => setEditing(rule)} className="text-text-muted hover:text-text-primary text-xs" data-testid={`edit-${rule.id}`}>Edit</button>
              <button onClick={() => remove(rule.id)} className="text-red-400 hover:text-red-300 text-xs" data-testid={`delete-${rule.id}`}>Delete</button>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <RuleEditor
          rule={editing}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </div>
  )
}

function RuleEditor({ rule, onCancel, onSave }: {
  rule: RewriteRule
  onCancel: () => void
  onSave: (r: RewriteRule) => void
}) {
  const [draft, setDraft] = useState<RewriteRule>(rule)

  function setMatch(patch: Partial<RewriteRule['match']>) {
    setDraft(d => ({ ...d, match: { ...d.match, ...patch } }))
  }

  function setActionType(type: RuleAction['type']) {
    let action: RuleAction
    switch (type) {
      case 'serve_local_file': action = { type, path: '', content_type: null }; break
      case 'redirect': action = { type, to_url: '' }; break
      case 'mock_response': action = { type, status: 200, content_type: 'application/json', body: '{}' }; break
      case 'rewrite_response_body': action = { type, replacements: [['', '']] }; break
      case 'rewrite_request_body': action = { type, replacements: [['', '']] }; break
    }
    setDraft(d => ({ ...d, action }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="rule-editor">
      <div className="bg-bg-base border border-border rounded-lg p-5 w-[520px] max-h-[85vh] overflow-y-auto">
        <h2 className="text-text-primary font-display font-bold text-base mb-4">Edit rule</h2>

        <label className="block text-xs text-text-muted mb-1">Name</label>
        <input className="field-input w-full mb-3" value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} data-testid="edit-name" />

        <div className="text-xs text-text-secondary font-semibold mb-2 mt-4">Match</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Method (blank = any)</label>
            <input className="field-input w-full" value={draft.match.method ?? ''}
              onChange={e => setMatch({ method: e.target.value || null })} placeholder="GET" data-testid="edit-method" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Host (suffix)</label>
            <input className="field-input w-full" value={draft.match.host}
              onChange={e => setMatch({ host: e.target.value })} placeholder="example.com" data-testid="edit-host" />
          </div>
        </div>
        <label className="block text-xs text-text-muted mb-1">Path contains</label>
        <input className="field-input w-full mb-2" value={draft.match.path_contains}
          onChange={e => setMatch({ path_contains: e.target.value })} placeholder="/v1/resource" data-testid="edit-path" />
        <label className="block text-xs text-text-muted mb-1">URL regex (optional, overrides path)</label>
        <input className="field-input w-full mb-3" value={draft.match.url_regex ?? ''}
          onChange={e => setMatch({ url_regex: e.target.value || null })} placeholder="pkg@\d+" data-testid="edit-regex" />

        <div className="text-xs text-text-secondary font-semibold mb-2 mt-4">Action</div>
        <select className="field-input w-full mb-3" value={draft.action.type}
          onChange={e => setActionType(e.target.value as RuleAction['type'])} data-testid="edit-action-type">
          {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <ActionFields action={draft.action} onChange={a => setDraft(d => ({ ...d, action: a }))} />

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onCancel} data-testid="edit-cancel">Cancel</Button>
          <Button onClick={() => onSave(draft)} data-testid="edit-save">Save rule</Button>
        </div>
      </div>
    </div>
  )
}

function ActionFields({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  if (action.type === 'serve_local_file') {
    return (
      <>
        <label className="block text-xs text-text-muted mb-1">Local file path</label>
        <input className="field-input w-full mb-2" value={action.path}
          onChange={e => onChange({ ...action, path: e.target.value })}
          placeholder="/Users/you/dev/your-project/dist/bundle.js"
          data-testid="edit-file-path" />
        <label className="block text-xs text-text-muted mb-1">Content-Type (optional)</label>
        <input className="field-input w-full" value={action.content_type ?? ''}
          onChange={e => onChange({ ...action, content_type: e.target.value || null })}
          placeholder="application/javascript" />
      </>
    )
  }
  if (action.type === 'redirect') {
    return (
      <>
        <label className="block text-xs text-text-muted mb-1">Redirect to URL</label>
        <input className="field-input w-full" value={action.to_url}
          onChange={e => onChange({ ...action, to_url: e.target.value })}
          placeholder="http://localhost:3000/api/..." data-testid="edit-redirect-url" />
      </>
    )
  }
  if (action.type === 'mock_response') {
    return (
      <>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-xs text-text-muted mb-1">Status</label>
            <input type="number" className="field-input w-full" value={action.status}
              onChange={e => onChange({ ...action, status: parseInt(e.target.value) || 200 })} data-testid="edit-mock-status" />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Content-Type</label>
            <input className="field-input w-full" value={action.content_type ?? ''}
              onChange={e => onChange({ ...action, content_type: e.target.value || null })} />
          </div>
        </div>
        <label className="block text-xs text-text-muted mb-1">Body</label>
        <textarea className="field-input w-full h-24 font-mono text-xs" value={action.body}
          onChange={e => onChange({ ...action, body: e.target.value })} data-testid="edit-mock-body" />
      </>
    )
  }
  // rewrite_response_body / rewrite_request_body
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">Replacements (from → to)</label>
      {action.replacements.map((pair, i) => (
        <div key={i} className="flex gap-2 mb-1">
          <input className="field-input flex-1" value={pair[0]} placeholder="from"
            onChange={e => {
              const next = action.replacements.map((p, j) => j === i ? [e.target.value, p[1]] as [string, string] : p)
              onChange({ ...action, replacements: next })
            }} data-testid={`edit-replace-from-${i}`} />
          <input className="field-input flex-1" value={pair[1]} placeholder="to"
            onChange={e => {
              const next = action.replacements.map((p, j) => j === i ? [p[0], e.target.value] as [string, string] : p)
              onChange({ ...action, replacements: next })
            }} data-testid={`edit-replace-to-${i}`} />
        </div>
      ))}
      <button className="text-accent text-xs mt-1"
        onClick={() => onChange({ ...action, replacements: [...action.replacements, ['', '']] })}
        data-testid="edit-add-replacement">+ Add replacement</button>
    </div>
  )
}
