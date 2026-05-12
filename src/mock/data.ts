import type { ProxyEntry, ProxySettings, HeaderList } from '@/types'

let idCounter = 1

const COMMON_REQ_HEADERS: HeaderList = [
  ['host', 'api.example.com'],
  ['user-agent', 'proxyorbit-mock/1.0'],
  ['accept', 'application/json'],
  ['accept-encoding', 'gzip, deflate, br'],
]

const COMMON_RES_HEADERS: HeaderList = [
  ['content-type', 'application/json; charset=utf-8'],
  ['content-encoding', 'gzip'],
  ['cache-control', 'no-cache'],
  ['x-request-id', 'mock-abc123'],
]

function makeEntry(
  method: string,
  url: string,
  status: number | null,
  durationMs: number,
  isHttps = false,
  process?: string,
  opts: {
    reqBody?: string | null
    resBody?: string | null
    reqHeaders?: HeaderList
    resHeaders?: HeaderList
  } = {},
): ProxyEntry {
  const u = new URL(url)
  // Override host in mock headers to match the actual URL so cURL export
  // from a mock entry looks right.
  const reqHeaders = (opts.reqHeaders ?? COMMON_REQ_HEADERS).map(([k, v]) =>
    k.toLowerCase() === 'host' ? [k, u.host] as [string, string] : [k, v] as [string, string],
  )
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
    request_headers: reqHeaders,
    response_headers: opts.resHeaders ?? COMMON_RES_HEADERS,
    request_body: opts.reqBody ?? null,
    response_body: opts.resBody ?? null,
    request_body_truncated: false,
    response_body_truncated: false,
    kind: 'http',
  }
}

// A realistic JSON body for the OpenAI-style request so DetailPanel has
// something substantial to pretty-print in mock mode.
const OPENAI_REQ = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain HTTP proxies in one paragraph.' },
  ],
  temperature: 0.7,
}, null, 2)

const OPENAI_RES = JSON.stringify({
  id: 'chatcmpl-abc123',
  object: 'chat.completion',
  created: 1_700_000_000,
  model: 'gpt-4o-mini',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'An HTTP proxy sits between a client and a server, forwarding requests and responses while optionally inspecting, modifying, or caching them.',
      },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 24, completion_tokens: 32, total_tokens: 56 },
}, null, 2)

export const mockEntries: ProxyEntry[] = [
  makeEntry('GET',    'https://api.github.com/user',                     200, 142, true,  'node',
    { resBody: JSON.stringify({ login: 'slothlabs', id: 12345, name: 'SlothLabs' }, null, 2) }),
  makeEntry('POST',   'https://api.openai.com/v1/chat/completions',      200, 2341, true, 'node',
    { reqBody: OPENAI_REQ, resBody: OPENAI_RES }),
  makeEntry('GET',    'https://registry.npmjs.org/react',                200, 89,  true,  'npm'),
  makeEntry('GET',    'https://fonts.googleapis.com/css2?family=Inter',  200, 34,  true,  'Chrome'),
  makeEntry('POST',   'https://api.stripe.com/v1/payment_intents',       402, 221, true,  'node',
    { reqBody: 'amount=2000&currency=usd&payment_method_types[]=card',
      resBody: JSON.stringify({ error: { code: 'card_declined', message: 'Your card was declined.' } }, null, 2) }),
  makeEntry('GET',    'https://api.github.com/repos/anthropics/claude',  404, 98,  true,  'curl',
    { resBody: JSON.stringify({ message: 'Not Found' }, null, 2) }),
  makeEntry('PUT',    'https://s3.amazonaws.com/bucket/file.json',       200, 445, true,  'aws-cli'),
  makeEntry('GET',    'https://checkip.amazonaws.com',                   200, 56,  true,  'Terminal',
    { resBody: '73.12.45.200\n' }),
  makeEntry('DELETE', 'https://api.example.com/items/42',                204, 67,  true,  'Postman'),
  makeEntry('GET',    'http://localhost:3001/api/pods',                   200, 12,  false, 'Chrome',
    { resBody: JSON.stringify({ pods: [{ name: 'web-1', status: 'Running' }] }, null, 2) }),
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
