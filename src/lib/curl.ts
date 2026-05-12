import type { ProxyEntry, HeaderList } from '@/types'

// Headers that `curl` sets automatically or that would be meaningless in a
// replayed command. Filtered out of the generated `-H` flags so the output
// is clean and portable.
const OMIT_HEADERS = new Set([
  'host',                // curl sets this from the URL
  'content-length',      // curl computes this
  'connection',          // hop-by-hop
  'proxy-connection',    // hop-by-hop
  'transfer-encoding',   // hop-by-hop
  'accept-encoding',     // curl handles compression itself via --compressed
  'te',                  // hop-by-hop
  'upgrade',             // hop-by-hop
])

/** Shell-escape a value for single-quoted inclusion in a bash command. */
function shSingleQuote(s: string): string {
  // `'` inside single-quoted strings is written as `'\''`
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Build a portable `curl` command that reproduces the captured request.
 * Safe to paste into a terminal: single-quoted everywhere, multi-line with
 * trailing backslashes for readability.
 *
 * Caveats (documented in the DetailPanel tooltip too):
 * - Response cookies from the original request aren't replayed — the Cookie
 *   header captured here reflects what the client sent at that time.
 * - Binary bodies are captured as `<binary:...>` strings which won't replay
 *   correctly; in that case the curl omits `--data` and we flag it.
 */
export function toCurl(entry: ProxyEntry): string {
  const lines: string[] = []

  const method = entry.method.toUpperCase()
  // GET/HEAD don't need --request; every other method does for clarity.
  if (method !== 'GET') lines.push(`-X ${method}`)

  for (const [k, v] of filterHeaders(entry.request_headers)) {
    lines.push(`-H ${shSingleQuote(`${k}: ${v}`)}`)
  }

  const body = entry.request_body
  const isBinary = body?.startsWith('<binary:')
  if (body && !isBinary) {
    lines.push(`--data-raw ${shSingleQuote(body)}`)
  }

  lines.push(shSingleQuote(entry.url))

  // Compose — `curl \` on first line, each flag on its own line with
  // a trailing `\` so the whole command is one statement.
  const head = 'curl \\'
  const body_lines = lines.map((l, i) => `  ${l}${i < lines.length - 1 ? ' \\' : ''}`)
  let out = [head, ...body_lines].join('\n')

  if (isBinary) {
    out += '\n\n# NOTE: request body was binary and is omitted. Re-run with --data-binary @file'
  }
  return out
}

function filterHeaders(h: HeaderList): HeaderList {
  return h.filter(([k]) => !OMIT_HEADERS.has(k.toLowerCase()))
}

// ── Body pretty-print ────────────────────────────────────────────────────────

/**
 * Attempt to pretty-print a string body. Returns `{ formatted, language }`.
 * Handles JSON; other formats stay as-is with language = "text".
 * Binary markers (`<binary:...>`) are returned unchanged with language =
 * "binary" so the viewer can show them in a muted style.
 */
export function prettyBody(body: string | null | undefined): { text: string; language: 'json' | 'text' | 'binary' | 'empty' } {
  if (body == null || body === '') return { text: '', language: 'empty' }
  if (body.startsWith('<binary:')) return { text: body, language: 'binary' }
  const trimmed = body.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(body)
      return { text: JSON.stringify(parsed, null, 2), language: 'json' }
    } catch {
      // Fall through — not valid JSON, just show as text
    }
  }
  return { text: body, language: 'text' }
}
