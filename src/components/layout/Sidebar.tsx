import React from 'react'
import { motion } from 'framer-motion'
import type { Screen } from '@/types'
import type { ProxyRunStatus } from '@/components/ui/Badge'
import { ProxyStatusDot } from '@/components/ui/Badge'

interface SidebarProps {
  screen: Screen
  onNavigate: (screen: Screen) => void
  collapsed: boolean
  onToggleCollapse: () => void
  proxyRunStatus: ProxyRunStatus
  requestCount: number
  onToggleProxy: () => void
  newsUnread?: number
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconCapture() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

function IconBook() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
    </svg>
  )
}

function IconHeart() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  )
}

function IconCollapse({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    >
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}

function IconPower() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18.36 6.64a9 9 0 11-12.73 0"/>
      <line x1="12" y1="2" x2="12" y2="12"/>
    </svg>
  )
}

function IconNews() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
    </svg>
  )
}

// ── Nav definitions ────────────────────────────────────────────────────────────

const topNav = [
  { id: 'home' as Screen, label: 'Capture', icon: <IconCapture /> },
  { id: 'news' as Screen, label: 'News',    icon: <IconNews /> },
]

const bottomNav = [
  { id: 'settings' as Screen, label: 'Settings', icon: <IconSettings /> },
  { id: 'docs'     as Screen, label: 'Docs',     icon: <IconBook /> },
  { id: 'support'  as Screen, label: 'Support',  icon: <IconHeart /> },
]

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar({
  screen, onNavigate, collapsed, onToggleCollapse,
  proxyRunStatus, requestCount, onToggleProxy, newsUnread = 0,
}: SidebarProps) {
  const w = collapsed ? 48 : 200
  const isRunning = proxyRunStatus === 'running'

  return (
    <motion.div
      className="flex flex-col h-full bg-bg-elevated border-r border-border flex-shrink-0 overflow-hidden"
      animate={{ width: w }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Top nav */}
      <div className="py-2 border-b border-border-subtle flex-shrink-0">
        {topNav.map(item => (
          <NavButton
            key={item.id}
            item={item}
            active={screen === item.id}
            collapsed={collapsed}
            onNavigate={onNavigate}
            badge={item.id === 'news' && newsUnread > 0 ? newsUnread : undefined}
            countBadge={item.id === 'home' && requestCount > 0 ? requestCount : undefined}
          />
        ))}
      </div>

      {/* Proxy status section */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 min-h-0">
        {/* Proxy toggle */}
        <div className={`mx-2 rounded-xl border p-3 ${
          isRunning ? 'border-primary/30 bg-primary/5' : 'border-border bg-bg-surface'
        }`}>
          {!collapsed && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Proxy</span>
              <ProxyStatusDot status={proxyRunStatus} />
            </div>
          )}

          <button
            onClick={onToggleProxy}
            disabled={proxyRunStatus === 'starting'}
            className={`flex items-center justify-center gap-2 w-full rounded-lg py-2 transition-all font-medium text-xs ${
              isRunning
                ? 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30'
                : 'bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={collapsed ? (isRunning ? 'Stop proxy' : 'Start proxy') : undefined}
          >
            <IconPower />
            {!collapsed && (
              proxyRunStatus === 'starting' ? 'Starting…' :
              isRunning ? 'Stop' : 'Start'
            )}
          </button>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="py-2 border-t border-border-subtle flex-shrink-0">
        {bottomNav.map(item => (
          <NavButton
            key={item.id}
            item={item}
            active={screen === item.id}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}

        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-3 w-full px-3 py-2 text-text-muted hover:text-text-primary hover:bg-bg-surface transition-colors rounded-lg mx-1 mt-1"
          style={{ width: 'calc(100% - 8px)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            <IconCollapse collapsed={collapsed} />
          </span>
          {!collapsed && <span className="text-xs whitespace-nowrap">Collapse</span>}
        </button>
      </div>
    </motion.div>
  )
}

function NavButton({ item, active, collapsed, onNavigate, badge, countBadge }: {
  item: { id: Screen; label: string; icon: React.ReactNode }
  active: boolean
  collapsed: boolean
  onNavigate: (screen: Screen) => void
  badge?: number
  countBadge?: number
}) {
  const isSupport = item.id === 'support'
  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`flex items-center gap-3 w-full transition-colors rounded-lg mx-1 px-3 py-2 ${
        active
          ? isSupport ? 'bg-rose-500/10 text-rose-400' : 'bg-primary/10 text-primary'
          : isSupport
            ? 'text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface'
      }`}
      style={{ width: 'calc(100% - 8px)' }}
      title={collapsed ? item.label : undefined}
    >
      <span className="relative flex-shrink-0 w-4 h-4 flex items-center justify-center">
        {item.icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary border border-bg-elevated" />
        )}
      </span>
      {!collapsed && (
        <span className="text-sm font-medium whitespace-nowrap overflow-hidden flex-1">{item.label}</span>
      )}
      {!collapsed && badge !== undefined && badge > 0 && !active && (
        <span className="ml-auto text-[9px] font-mono bg-primary/15 text-primary rounded px-1 py-0.5 flex-shrink-0">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {!collapsed && countBadge !== undefined && countBadge > 0 && (
        <span className="text-[10px] bg-bg-overlay text-text-muted rounded-full px-1.5 py-0.5 font-mono flex-shrink-0">
          {countBadge > 999 ? '999+' : countBadge}
        </span>
      )}
    </button>
  )
}

export default Sidebar
