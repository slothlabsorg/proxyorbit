export type Screen = 'home' | 'settings' | 'docs' | 'support'

/** Matches the tuple form serialised by the Rust side — `Vec<(String, String)>`. */
export type HeaderList = Array<[string, string]>

export type EntryKind = 'http' | 'connect' | 'websocket'

export interface ProxyEntry {
  id: string
  timestamp: number       // ms since epoch
  method: string
  url: string
  host: string
  path: string
  status: number | null
  duration_ms: number | null
  request_size: number
  response_size: number
  is_https: boolean
  protocol: string
  process?: string
  // Captured content — only populated for EntryKind.http (CONNECT tunnels
  // carry TLS-encrypted bytes we don't decrypt).
  request_headers: HeaderList
  response_headers: HeaderList
  request_body: string | null
  response_body: string | null
  request_body_truncated: boolean
  response_body_truncated: boolean
  kind: EntryKind
}

export interface ProxyStatus {
  running: boolean
  port: number
  request_count: number
  system_proxy_set: boolean
  intercepting: boolean
  mitm_enabled: boolean
}

export interface ProxySettings {
  port: number
  auto_start: boolean
  auto_set_system_proxy: boolean
  max_entries: number
  exclude_hosts: string[]
}

/** Payload emitted to the frontend when the proxy pauses a request for
 *  interception. The `id` must round-trip back in the release decision. */
export interface InterceptPayload {
  id: string
  method: string
  url: string
  headers: HeaderList
  body: string | null
}

/** Decision sent back via `intercept-release` event. `action` is one of
 *  `"forward"` (send, optionally modified) or `"drop"` (444 back to client). */
export interface InterceptDecision {
  id: string
  action: 'forward' | 'drop'
  method?: string
  url?: string
  headers?: HeaderList
  body?: string
}

/** Replay result payload from the `replay_request` command. */
export interface ReplayResult {
  status: number | null
  duration_ms: number
  response_headers: HeaderList
  response_body: string | null
  response_body_truncated: boolean
  error: string | null
}
