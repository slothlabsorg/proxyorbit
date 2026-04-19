import { useState, useEffect, useCallback, useRef } from 'react'
import type { Screen, ProxyEntry, ProxyStatus } from '@/types'
import type { ProxyRunStatus } from '@/components/ui/Badge'
import { api } from '@/lib/tauri'
import { mockEntries } from '@/mock/data'
import { Shell } from '@/components/layout/Shell'
import { Home } from '@/screens/Home'
import { Settings } from '@/screens/Settings'
import { Docs } from '@/screens/Docs'
import { Support } from '@/screens/Support'

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
  const unlistenRef = useRef<(() => void) | null>(null)

  // Initialize
  useEffect(() => {
    const init = async () => {
      if (URL_MOCK) {
        setEntries(mockEntries)
        setProxyStatus({ running: true, port: 8080, request_count: mockEntries.length, system_proxy_set: false })
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

        // Subscribe to real-time events
        const unlisten = await api.onRequest(entry => {
          setEntries(prev => [...prev.slice(-9999), entry])
          setProxyStatus(s => s ? { ...s, request_count: (s.request_count || 0) + 1 } : s)
        })
        unlistenRef.current = unlisten
      } catch {
        // Not in Tauri or proxy not started yet
      } finally {
        setIsLoading(false)
      }
    }
    init()
    return () => { unlistenRef.current?.() }
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
          await api.setSystemProxy(settings.port).catch(() => {})
        }
        const status = await api.getProxyStatus()
        setProxyStatus(status)
        setProxyRunStatus('running')

        // Subscribe to real-time events if not already
        if (!unlistenRef.current) {
          const unlisten = await api.onRequest(entry => {
            setEntries(prev => [...prev.slice(-9999), entry])
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
  )
}
