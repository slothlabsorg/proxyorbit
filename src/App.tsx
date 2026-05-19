import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Screen, ProxyEntry, ProxyStatus, InterceptPayload } from '@/types'
import type { ProxyRunStatus } from '@/components/ui/Badge'
import { api } from '@/lib/tauri'
import { mockEntries } from '@/mock/data'
import { Shell } from '@/components/layout/Shell'
import { Home } from '@/screens/Home'
import { Settings } from '@/screens/Settings'
import { Docs } from '@/screens/Docs'
import { Support } from '@/screens/Support'
import { News } from '@/screens/News'
import { UpdaterModal } from '@/components/UpdaterModal'
import { InterceptModal } from '@/components/ui/InterceptModal'
import { getUnreadIds, markRead, loadNews } from '@/lib/news'
import { MOCK_FEED } from '@/data/news-mock'
import type { NewsItem } from '@/types/news'

function getUrlParam(key: string): string | null {
  try { return new URL(window.location.href).searchParams.get(key) } catch { return null }
}
const URL_SCREEN      = (getUrlParam('screen') as Screen | null) ?? 'home'
const URL_MOCK        = getUrlParam('mock') === '1'
const URL_UPDATER     = getUrlParam('updater') === '1'
const URL_MOCK_NEWS   = getUrlParam('mockNews') === '1' || getUrlParam('news') === '1'
const URL_MOCK_UPDATE = getUrlParam('mockUpdate') === '1'
const URL_MOCK_UPDATE_VER = getUrlParam('mockUpdateVersion') ?? '1.0.1'

function validItem(i: NewsItem) { return !i.expiresAt || new Date(i.expiresAt).getTime() > Date.now() }

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

  // Updater state — dismissed is persisted per-version so reload doesn't re-show modal
  const [hasUpdate, setHasUpdate] = useState(URL_MOCK_UPDATE)
  const [updateVersion, setUpdateVersion] = useState(URL_MOCK_UPDATE ? URL_MOCK_UPDATE_VER : '')
  const [updaterDismissed, setUpdaterDismissed] = useState(() => {
    const v = URL_MOCK_UPDATE ? URL_MOCK_UPDATE_VER : ''
    if (!v) return false
    try { return localStorage.getItem('proxyorbit.updaterDismissed') === v } catch { return false }
  })

  // News state — only load mock items when ?mockNews=1; skip real fetch in any ?mock=1 context
  const [newsItems, setNewsItems] = useState<NewsItem[]>(() =>
    URL_MOCK_NEWS ? MOCK_FEED.items.filter(validItem) : []
  )
  const [newsUnread, setNewsUnread] = useState(() =>
    URL_MOCK_NEWS ? getUnreadIds(MOCK_FEED.items.filter(validItem)).length : 0
  )

  // Load real news only when not in any mock or test context
  useEffect(() => {
    if (!URL_MOCK && !URL_MOCK_NEWS) {
      loadNews().then(items => {
        setNewsItems(items)
        setNewsUnread(getUnreadIds(items).length)
      }).catch(() => {})
    }
  }, [])

  // Bell items: synthetic update entry (when dismissed) + one item per kind from news
  const bellItems = useMemo(() => {
    type BellItem = { id: string; kind: 'update-available' | 'release' | 'announcement'; title: string; body?: string; date: string; url?: string }
    const items: BellItem[] = []
    if (hasUpdate && updaterDismissed) {
      items.push({ id: 'update-available', kind: 'update-available', title: `v${updateVersion} is available`, body: 'Click to install the latest update', date: new Date().toISOString() })
    }
    // At most one item per kind so the dropdown stays clean
    const seen = new Set<string>()
    for (const n of newsItems.filter(i => i.type !== 'ad')) {
      const kind = n.type === 'changelog' ? 'release' : 'announcement'
      if (seen.has(kind)) continue
      seen.add(kind)
      items.push({ id: n.id, kind, title: n.title, body: n.body.split('\n').filter(Boolean)[0] ?? '', date: n.publishedAt, url: n.action?.url })
    }
    return items
  }, [newsItems, hasUpdate, updaterDismissed, updateVersion])

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

        // Orphan-detect: if the proxy isn't running but launchctl still has
        // HTTP_PROXY=127.0.0.1:8080 left over from a previous crashed
        // session, clear it now. Otherwise every new terminal/IDE this user
        // opens points at a dead port and times out. CA-trust env vars are
        // NOT cleared — they're additive and harmless when the proxy is off.
        if (!status.running) {
          api.hasOrphanedProxyEnv().then(orphan => {
            if (orphan) {
              // eslint-disable-next-line no-console
              console.warn('[proxyorbit] cleaning orphaned HTTP_PROXY/HTTPS_PROXY/ALL_PROXY from launchd (previous session crashed)')
              api.forceClearProxyEnv().catch(() => {})
            }
          }).catch(() => {})
        }

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

  const renderScreen = () => {
    switch (screen) {
      case 'home':
        return (
          <Home
            entries={entries}
            isRunning={proxyRunStatus === 'running'}
            onClear={handleClear}
            onDelete={handleDelete}
            onStartProxy={handleToggleProxy}
          />
        )
      case 'news':
        return <News onVisit={() => {
          setNewsUnread(0)
          markRead(newsItems.map(i => i.id))
        }} />
      case 'settings':
        return <Settings />
      case 'docs':
        return <Docs />
      case 'support':
        return <Support />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
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
        newsUnread={newsUnread}
        bellItems={bellItems}
        onNewsMarkRead={() => {
          setNewsUnread(0)
          markRead(newsItems.map(i => i.id))
        }}
        onTriggerUpdate={() => setUpdaterDismissed(false)}
        showUpdateBanner={hasUpdate && updaterDismissed}
        updateVersion={updateVersion}
      >
        {renderScreen()}
      </Shell>

      {(!URL_MOCK || URL_UPDATER || URL_MOCK_UPDATE) && (
        <UpdaterModal
          dismissed={updaterDismissed}
          onDismiss={() => {
          if (updateVersion) {
            try { localStorage.setItem('proxyorbit.updaterDismissed', updateVersion) } catch {}
          }
          setUpdaterDismissed(true)
        }}
          onUpdateAvailable={(version, _body) => {
          setHasUpdate(true)
          setUpdateVersion(version)
          // If this version was previously dismissed, restore that state
          try {
            if (localStorage.getItem('proxyorbit.updaterDismissed') === version) {
              setUpdaterDismissed(true)
            }
          } catch {}
        }}
        />
      )}

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
