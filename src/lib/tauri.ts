import type { ProxyEntry, ProxyStatus, ProxySettings } from '@/types'

// Tauri invoke wrapper — falls back gracefully in browser mode
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<T> } }
  if (w.__TAURI_INTERNALS__?.invoke) {
    return w.__TAURI_INTERNALS__.invoke(cmd, args)
  }
  throw new Error(`Tauri not available (cmd: ${cmd})`)
}

// Tauri event listener
type UnlistenFn = () => void
async function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  const w = window as unknown as { __TAURI_INTERNALS__?: { listen: (event: string, handler: (e: { payload: T }) => void) => Promise<UnlistenFn> } }
  if (w.__TAURI_INTERNALS__?.listen) {
    return w.__TAURI_INTERNALS__.listen(event, (e) => handler(e.payload))
  }
  return () => {}
}

export const api = {
  // Proxy control
  startProxy: (port: number) => invoke<void>('start_proxy', { port }),
  stopProxy: () => invoke<void>('stop_proxy'),
  getProxyStatus: () => invoke<ProxyStatus>('get_proxy_status'),

  // Request log
  listEntries: (limit?: number) => invoke<ProxyEntry[]>('list_entries', { limit: limit ?? 1000 }),
  clearEntries: () => invoke<void>('clear_entries'),
  deleteEntry: (id: string) => invoke<void>('delete_entry', { id }),

  // System proxy
  setSystemProxy: (port: number) => invoke<void>('set_system_proxy', { port }),
  unsetSystemProxy: () => invoke<void>('unset_system_proxy'),
  getNetworkService: () => invoke<string>('get_network_service'),

  // Settings
  getSettings: () => invoke<ProxySettings>('get_settings'),
  saveSettings: (settings: ProxySettings) => invoke<void>('save_settings', { settings }),

  // Events
  onRequest: (handler: (entry: ProxyEntry) => void) => listen<ProxyEntry>('proxy-request', handler),
}
