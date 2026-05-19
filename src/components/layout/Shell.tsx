import React from 'react'
import type { Screen, ProxyStatus } from '@/types'
import type { ProxyRunStatus } from '@/components/ui/Badge'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'

type BellItem = { id: string; kind: 'update-available' | 'release' | 'announcement'; title: string; body?: string; date: string; url?: string }

interface ShellProps {
  screen: Screen
  onNavigate: (screen: Screen) => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  proxyStatus: ProxyStatus | null
  proxyRunStatus: ProxyRunStatus
  entryCount: number
  filteredCount: number
  onToggleProxy: () => void
  newsUnread?: number
  bellItems?: BellItem[]
  onNewsMarkRead?: () => void
  onTriggerUpdate?: () => void
  showUpdateBanner?: boolean
  updateVersion?: string
  children: React.ReactNode
}

export function Shell({
  screen, onNavigate, sidebarCollapsed, onToggleSidebar,
  proxyStatus, proxyRunStatus,
  entryCount, filteredCount, onToggleProxy,
  newsUnread = 0,
  bellItems = [],
  onNewsMarkRead,
  onTriggerUpdate,
  showUpdateBanner = false,
  updateVersion = '',
  children,
}: ShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Titlebar
        proxyStatus={proxyStatus}
        bellItems={bellItems}
        newsUnread={newsUnread}
        onNewsMarkRead={onNewsMarkRead}
        onTriggerUpdate={onTriggerUpdate}
        showUpdateBanner={showUpdateBanner}
        updateVersion={updateVersion}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          screen={screen}
          onNavigate={onNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          proxyRunStatus={proxyRunStatus}
          requestCount={entryCount}
          onToggleProxy={onToggleProxy}
          newsUnread={newsUnread}
        />

        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>

      <StatusBar
        proxyStatus={proxyStatus}
        entryCount={entryCount}
        filteredCount={filteredCount}
      />
    </div>
  )
}

export default Shell
