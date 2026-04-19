import type { ProxyEntry, ProxySettings } from '@/types'

let idCounter = 1
function makeEntry(
  method: string,
  url: string,
  status: number | null,
  durationMs: number,
  isHttps = false,
  process?: string,
): ProxyEntry {
  const u = new URL(url)
  return {
    id: `req-${idCounter++}`,
    timestamp: Date.now() - Math.floor(Math.random() * 60_000),
    method,
    url,
    host: u.hostname,
    path: u.pathname + u.search,
    status,
    duration_ms: durationMs,
    request_size: Math.floor(Math.random() * 2048),
    response_size: Math.floor(Math.random() * 50_000),
    is_https: isHttps,
    protocol: isHttps ? 'HTTPS' : 'HTTP',
    process,
  }
}

export const mockEntries: ProxyEntry[] = [
  makeEntry('GET',    'https://api.github.com/user',                     200, 142, true,  'node'),
  makeEntry('POST',   'https://api.openai.com/v1/chat/completions',      200, 2341, true, 'node'),
  makeEntry('GET',    'https://registry.npmjs.org/react',                200, 89,  true,  'npm'),
  makeEntry('GET',    'https://fonts.googleapis.com/css2?family=Inter',  200, 34,  true,  'Chrome'),
  makeEntry('POST',   'https://api.stripe.com/v1/payment_intents',       402, 221, true,  'node'),
  makeEntry('GET',    'https://api.github.com/repos/anthropics/claude',  404, 98,  true,  'curl'),
  makeEntry('PUT',    'https://s3.amazonaws.com/bucket/file.json',       200, 445, true,  'aws-cli'),
  makeEntry('GET',    'https://checkip.amazonaws.com',                   200, 56,  true,  'Terminal'),
  makeEntry('DELETE', 'https://api.example.com/items/42',                204, 67,  true,  'Postman'),
  makeEntry('GET',    'http://localhost:3001/api/pods',                   200, 12,  false, 'Chrome'),
  makeEntry('POST',   'https://telemetry.example.com/events',            200, 34,  true,  'Electron'),
  makeEntry('GET',    'https://update.electronjs.org/check',             304, 88,  true,  'Electron'),
  makeEntry('GET',    'https://api.github.com/repos/vitejs/vite/tags',   200, 156, true,  'node'),
  makeEntry('POST',   'https://api.anthropic.com/v1/messages',           200, 3210, true, 'node'),
  makeEntry('GET',    'https://objects.githubusercontent.com/asset.zip', 206, 8900, true, 'curl'),
]

export const mockSettings: ProxySettings = {
  port: 8080,
  auto_start: true,
  auto_set_system_proxy: true,
  max_entries: 10_000,
  exclude_hosts: ['localhost', '127.0.0.1'],
}
