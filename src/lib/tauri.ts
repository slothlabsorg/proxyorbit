import type {
  ProxyEntry, ProxyStatus, ProxySettings,
  HeaderList, ReplayResult, InterceptPayload, InterceptDecision,
} from '@/types'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen, emit as tauriEmit } from '@tauri-apps/api/event'

// Thin wrappers around the real Tauri 2 API modules. The previous hand-rolled
// `__TAURI_INTERNALS__.listen` didn't exist in Tauri 2 (listen goes through
// a plugin command + channel) — which is why proxy-request events were
// never reaching the UI even though Rust was emitting them.
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args)
}

type UnlistenFn = () => void
async function listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return tauriListen<T>(event, (e) => handler(e.payload))
}

async function emit(event: string, payload: unknown): Promise<void> {
  await tauriEmit(event, payload)
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

  // Interceptor
  setIntercepting: (enabled: boolean) => invoke<void>('set_intercepting', { enabled }),

  // Replay a captured (or modified) request outside the proxy stream.
  // Doesn't write to the entry log — replays are considered disposable.
  replayRequest: (args: { method: string; url: string; headers: HeaderList; body?: string | null }) =>
    invoke<ReplayResult>('replay_request', args),

  // Release an intercept hold — `action: "forward"` (optionally with
  // modified method/url/headers/body) or `"drop"` (returns 444).
  releaseIntercept: (decision: InterceptDecision) => emit('intercept-release', decision),

  // MITM HTTPS inspection
  setMitmEnabled: (enabled: boolean) => invoke<void>('set_mitm_enabled', { enabled }),
  getCaPem: () => invoke<string>('get_ca_pem'),
  getCaPemPath: () => invoke<string>('get_ca_pem_path'),
  setMitmBypassHosts: (hosts: string[]) => invoke<void>('set_mitm_bypass_hosts', { hosts }),

  // Events
  onRequest: (handler: (entry: ProxyEntry) => void) => listen<ProxyEntry>('proxy-request', handler),
  onInterceptRequest: (handler: (p: InterceptPayload) => void) => listen<InterceptPayload>('intercept-request', handler),
}
