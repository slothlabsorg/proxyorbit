import React from 'react'
import type { Screen, ProxyStatus } from '@/types'
import type { ProxyRunStatus } from '@/components/ui/Badge'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'

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
  children: React.ReactNode
}

export function Shell({
  screen, onNavigate, sidebarCollapsed, onToggleSidebar,
  proxyStatus, proxyRunStatus,
  entryCount, filteredCount, onToggleProxy,
  children,
}: ShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Titlebar proxyStatus={proxyStatus} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          screen={screen}
          onNavigate={onNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          proxyRunStatus={proxyRunStatus}
          requestCount={entryCount}
          onToggleProxy={onToggleProxy}
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
