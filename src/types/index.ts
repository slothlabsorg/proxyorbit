export type Screen = 'home' | 'settings' | 'docs' | 'support'

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
}

export interface ProxyStatus {
  running: boolean
  port: number
  request_count: number
  system_proxy_set: boolean
}

export interface ProxySettings {
  port: number
  auto_start: boolean
  auto_set_system_proxy: boolean
  max_entries: number
  exclude_hosts: string[]
}
