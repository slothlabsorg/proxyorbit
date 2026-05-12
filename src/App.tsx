import { useState, useEffect, useCallback, useRef } from 'react'
import type { Screen, ProxyEntry, ProxyStatus, InterceptPayload } from '@/types'
import type { ProxyRunStatus } from '@/components/ui/Badge'
import { api } from '@/lib/tauri'
import { mockEntries } from '@/mock/data'
import { Shell } from '@/components/layout/Shell'
import { Home } from '@/screens/Home'
import { Settings } from '@/screens/Settings'
import { Docs } from '@/screens/Docs'
import { Support } from '@/screens/Support'
import { UpdateBanner } from '@/components/ui/UpdateBanner'
import { InterceptModal } from '@/components/ui/InterceptModal'

function getUrlParam(key: string): string | null {
  try { return new URL(window.location.href).searchParams.get(key) } catch { return null }
}
const URL_SCREEN = (getUrlParam('screen') as Screen | null) ?? 'home'
const URL_MOCK   = getUrlParam('mock') === '1'

export default function App() {
  const [screen, setScreen]               = useState<Screen>(URL_SCREEN)
  const [entries, setEntries]             = useState<ProxyEntry[]>([])
  const [proxyStatus, setProxyStatus]     = useState<ProxyStatus | null>(null)
  const [proxyRunStatus, setProxyRunStatus] = useState<ProxyRunStatus>('stopped')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isLoading, setIsLoading]         = useState(true)
  // Queue of intercept requests waiting for user decision. We only show the
  // oldest one in the modal; as soon as it's released we pull the next.
  const [interceptQueue, setInterceptQueue] = useState<InterceptPayload[]>([])
  const unlistenRef = useRef<(() => void) | null>(null)
  const unlistenInterceptRef = useRef<(() => void) | null>(null)

  // Initialize
  useEffect(() => {
    const init = async () => {
      if (URL_MOCK) {
        setEntries(mockEntries)
        setProxyStatus({ running: true, port: 8080, request_count: mockEntries.length, system_proxy_set: false, intercepting: false, mitm_enabled: false })
        setProxyRunStatus('running')
        setIsLoading(false)
        return
      }
      try {
        const [status, entries] = await Promise.all([
          api.getProxyStatus(),
          api.listEntries(),
        ])
        setProxyStatus(status)
        setEntries(entries)
        setProxyRunStatus(status.running ? 'running' : 'stopped')

        // Subscribe to real-time events. React StrictMode in dev double-mounts
        // the effect so we could wind up with two listeners on the same event;
        // dedup by id as a belt-and-suspenders guard. Bounded to MAX entries.
        const unlisten = await api.onRequest(entry => {
          setEntries(prev => {
            if (prev.some(e => e.id === entry.id)) return prev
            const next = [...prev, entry]
            return next.length > 9999 ? next.slice(next.length - 9999) : next
          })
          setProxyStatus(s => s ? { ...s, request_count: (s.request_count || 0) + 1 } : s)
        })
        unlistenRef.current = unlisten

        // Subscribe to intercept requests — the Rust proxy emits one per
        // paused request and waits for our `intercept-release` reply.
        const unlistenIntercept = await api.onInterceptRequest(payload => {
          setInterceptQueue(q => [...q, payload])
        })
        unlistenInterceptRef.current = unlistenIntercept
      } catch {
        // Not in Tauri or proxy not started yet
      } finally {
        setIsLoading(false)
      }
    }
    init()
    return () => {
      unlistenRef.current?.()
      unlistenInterceptRef.current?.()
    }
  }, [])

  const handleToggleProxy = useCallback(async () => {
    if (URL_MOCK) {
      setProxyRunStatus(s => s === 'running' ? 'stopped' : 'running')
      setProxyStatus(s => s ? { ...s, running: !s.running } : null)
      return
    }

    if (proxyRunStatus === 'running') {
      setProxyRunStatus('stopped')
      try {
        await api.stopProxy()
        if (proxyStatus?.system_proxy_set) await api.unsetSystemProxy().catch(() => {})
        const status = await api.getProxyStatus()
        setProxyStatus(status)
      } catch {
        setProxyRunStatus('running')
      }
    } else {
      setProxyRunStatus('starting')
      try {
        const settings = await api.getSettings()
        await api.startProxy(settings.port)
        if (settings.auto_set_system_proxy) {
          // Surface the failure (admin-prompt cancelled, no sudo, etc.) so
          // the user sees why the capture is silent instead of assuming
          // everything is fine.
          try { await api.setSystemProxy(settings.port) }
          catch (e) {
            alert(
              `System proxy auto-configure failed: ${String(e)}\n\n` +
              `Run manually in Terminal:\n` +
              `sudo networksetup -setwebproxy Wi-Fi 127.0.0.1 ${settings.port} && \\\n` +
              `sudo networksetup -setwebproxystate Wi-Fi on && \\\n` +
              `sudo networksetup -setsecurewebproxy Wi-Fi 127.0.0.1 ${settings.port} && \\\n` +
              `sudo networksetup -setsecurewebproxystate Wi-Fi on`
            )
          }
        }
        const status = await api.getProxyStatus()
        setProxyStatus(status)
        setProxyRunStatus('running')

        // Subscribe to real-time events if not already. Same dedup logic as
        // the initial subscription — defensive against double-delivery.
        if (!unlistenRef.current) {
          const unlisten = await api.onRequest(entry => {
            setEntries(prev => {
              if (prev.some(e => e.id === entry.id)) return prev
              const next = [...prev, entry]
              return next.length > 9999 ? next.slice(next.length - 9999) : next
            })
          })
          unlistenRef.current = unlisten
        }
      } catch {
        setProxyRunStatus('stopped')
      }
    }
  }, [proxyRunStatus, proxyStatus])

  const handleClear = useCallback(async () => {
    setEntries([])
    if (!URL_MOCK) await api.clearEntries().catch(() => {})
    setProxyStatus(s => s ? { ...s, request_count: 0 } : s)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    if (!URL_MOCK) await api.deleteEntry(id).catch(() => {})
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg-base">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <UpdateBanner />
      <div className="flex-1 min-h-0">
        <Shell
          screen={screen}
          onNavigate={setScreen}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(c => !c)}
          proxyStatus={proxyStatus}
          proxyRunStatus={proxyRunStatus}
          entryCount={entries.length}
          filteredCount={entries.length}
          onToggleProxy={handleToggleProxy}
        >
          {screen === 'home' && (
            <Home
              entries={entries}
              isRunning={proxyRunStatus === 'running'}
              onClear={handleClear}
              onDelete={handleDelete}
              onStartProxy={handleToggleProxy}
            />
          )}
          {screen === 'settings' && <Settings />}
          {screen === 'docs'     && <Docs />}
          {screen === 'support'  && <Support />}
        </Shell>
      </div>

      {/* Intercept modal — only shows the oldest pending payload; next one
          auto-surfaces after the user resolves this one. */}
      <InterceptModal
        payload={interceptQueue[0] ?? null}
        onRelease={(decision) => {
          api.releaseIntercept(decision as any).catch(() => {})
          setInterceptQueue(q => q.slice(1))
        }}
      />
    </div>
  )
}
