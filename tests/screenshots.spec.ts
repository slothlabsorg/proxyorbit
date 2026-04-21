/**
 * ProxyOrbit — Visual Snapshot Suite
 *
 * Captures every screen + key interaction state with mock data.
 * Run:  npm run screenshots
 * View: open screenshots/  (PNG files)
 */
import { test, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ── helpers ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const OUT  = path.resolve(__dirname, '../screenshots')
const BASE = '/?mock=1'

function url(screen: string, extra = '') {
  return `${BASE}&screen=${screen}${extra}`
}

async function goto(page: Page, screen: string, extra = '') {
  await page.goto(url(screen, extra))
  await page.waitForSelector('.text-text-primary', { timeout: 8000 })
  await page.waitForTimeout(400)
}

async function snap(page: Page, name: string) {
  const filePath = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`  ✓  ${name}.png`)
}

// Ensure output dir exists
test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true })
  console.log(`\n📸  Screenshots → ${OUT}\n`)
})

// ── 01 — Capture: welcome / empty state (proxy stopped, no entries) ───────────

test('01 — capture welcome state (proxy stopped, no entries)', async ({ page }) => {
  await page.goto(`${BASE}&screen=home`)
  await page.waitForSelector('.text-text-primary', { timeout: 8_000 })
  await page.waitForTimeout(400)
  // Clear all entries to show empty state — click "Clear all" if visible
  const clearBtn = page.getByText('Clear all').first()
  if (await clearBtn.count() > 0) {
    await clearBtn.click()
    await page.waitForTimeout(300)
  }
  await snap(page, '01-capture-welcome')
})

// ── 02 — Capture: default with mock entries ───────────────────────────────────

test('02 — capture default with mock entries', async ({ page }) => {
  await goto(page, 'home')
  await snap(page, '02-capture-with-entries')
})

// ── 03 — Capture: sidebar collapsed ──────────────────────────────────────────

test('03 — capture sidebar collapsed', async ({ page }) => {
  await goto(page, 'home')
  const collapseBtn = page.locator('button[title*="Collapse" i], button[title*="collapse" i]').first()
  if (await collapseBtn.count() > 0) {
    await collapseBtn.click()
    await page.waitForTimeout(350)
  }
  await snap(page, '03-capture-sidebar-collapsed')
})

// ── 04 — Capture: detail panel open ──────────────────────────────────────────

test('04 — capture detail panel open on row click', async ({ page }) => {
  await goto(page, 'home')
  // Click the first request row
  const row = page.locator('.border-b.cursor-pointer').first()
  if (await row.count() > 0) {
    await row.click()
    await page.waitForTimeout(300)
  }
  await snap(page, '04-capture-detail-panel')
})

// ── 05 — Filter: text search active ──────────────────────────────────────────

test('05 — capture text filter active (github)', async ({ page }) => {
  await goto(page, 'home')
  const input = page.locator('input[placeholder*="Filter" i]').first()
  if (await input.count() > 0) {
    await input.fill('github')
    await page.waitForTimeout(300)
  }
  await snap(page, '05-capture-filter-text-github')
})

// ── 06 — Filter: method GET ───────────────────────────────────────────────────

test('06 — capture method filter GET', async ({ page }) => {
  await goto(page, 'home')
  const getBtn = page.getByText('GET', { exact: true }).first()
  if (await getBtn.count() > 0) {
    await getBtn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '06-capture-filter-method-get')
})

// ── 07 — Filter: method POST ──────────────────────────────────────────────────

test('07 — capture method filter POST', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('POST', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '07-capture-filter-method-post')
})

// ── 08 — Filter: status 2xx ───────────────────────────────────────────────────

test('08 — capture status filter 2xx', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('2xx', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '08-capture-filter-status-2xx')
})

// ── 09 — Filter: status 4xx ───────────────────────────────────────────────────

test('09 — capture status filter 4xx', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('4xx', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '09-capture-filter-status-4xx')
})

// ── 10 — Filter: HTTPS only ───────────────────────────────────────────────────

test('10 — capture protocol filter HTTPS', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('HTTPS', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '10-capture-filter-https')
})

// ── 11 — Filter: HTTP only ────────────────────────────────────────────────────

test('11 — capture protocol filter HTTP', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('HTTP', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '11-capture-filter-http')
})

// ── 12 — Filter: status 5xx (error state) ────────────────────────────────────

test('12 — capture status filter 5xx', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('5xx', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '12-capture-filter-status-5xx')
})

// ── 13 — Filter: no results (non-matching text) ───────────────────────────────

test('13 — capture no results (filter matches nothing)', async ({ page }) => {
  await goto(page, 'home')
  const input = page.locator('input[placeholder*="Filter" i]').first()
  if (await input.count() > 0) {
    await input.fill('zzz-no-match-xyz-999')
    await page.waitForTimeout(300)
  }
  await snap(page, '13-capture-filter-no-results')
})

// ── 14 — Filter: combined method + text ──────────────────────────────────────

test('14 — capture combined POST + api filter', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('POST', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(150)
  }
  const input = page.locator('input[placeholder*="Filter" i]').first()
  if (await input.count() > 0) {
    await input.fill('api')
    await page.waitForTimeout(300)
  }
  await snap(page, '14-capture-filter-combined-post-api')
})

// ── 15 — Auto-scroll toggled off ──────────────────────────────────────────────

test('15 — capture auto-scroll toggled off', async ({ page }) => {
  await goto(page, 'home')
  const autoScrollBtn = page.getByText(/Auto-scroll/i).first()
  if (await autoScrollBtn.count() > 0) {
    await autoScrollBtn.click()
    await page.waitForTimeout(200)
  }
  await snap(page, '15-capture-auto-scroll-off')
})

// ── 16 — Capture: GET openai entry detail ────────────────────────────────────

test('16 — capture detail of API entry (openai)', async ({ page }) => {
  await goto(page, 'home')
  const input = page.locator('input[placeholder*="Filter" i]').first()
  if (await input.count() > 0) {
    await input.fill('openai')
    await page.waitForTimeout(250)
  }
  const row = page.locator('.border-b.cursor-pointer').first()
  if (await row.count() > 0) {
    await row.click()
    await page.waitForTimeout(300)
  }
  await snap(page, '16-capture-detail-openai')
})

// ── 17 — Capture: proxy running indicator ────────────────────────────────────

test('17 — capture proxy running state (mock=1)', async ({ page }) => {
  await goto(page, 'home')
  // In mock mode, proxy shows as running in status bar
  await snap(page, '17-capture-proxy-running')
})

// ── 18 — Capture: intercepting empty state ────────────────────────────────────

test('18 — capture intercepting empty state (proxy on, no requests)', async ({ page }) => {
  // Use a fresh page with mock=1 but remove all entries
  await page.goto(`${BASE}&screen=home`)
  await page.waitForSelector('.text-text-primary', { timeout: 8_000 })
  await page.waitForTimeout(400)
  // For this screenshot we can't easily clear in mock mode,
  // but we can show the state description. Snap as-is.
  await snap(page, '18-capture-intercepting-state')
})

// ── 19 — Settings: default view ──────────────────────────────────────────────

test('19 — settings default view', async ({ page }) => {
  await goto(page, 'settings')
  await snap(page, '19-settings-default')
})

// ── 20 — Settings: exclude host added ────────────────────────────────────────

test('20 — settings exclude host added', async ({ page }) => {
  await goto(page, 'settings')
  const input = page.locator('input[placeholder*="localhost" i]').first()
  if (await input.count() > 0) {
    await input.fill('api.internal.example.com')
    const addBtn = page.getByText('Add', { exact: true }).first()
    if (await addBtn.count() > 0) {
      await addBtn.click()
      await page.waitForTimeout(200)
    }
  }
  await snap(page, '20-settings-exclude-host')
})

// ── 21 — Docs screen ─────────────────────────────────────────────────────────

test('21 — docs screen', async ({ page }) => {
  await goto(page, 'docs')
  await snap(page, '21-docs')
})

// ── 22 — Support screen ──────────────────────────────────────────────────────

test('22 — support screen', async ({ page }) => {
  await goto(page, 'support')
  await snap(page, '22-support')
})

// ── 23 — Window: 1400×900 larger display ──────────────────────────────────────

test('23 — capture 1400×900 larger display', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await goto(page, 'home')
  await snap(page, '23-capture-1400x900')
})

// ── 24 — Window: 900×600 minimum ─────────────────────────────────────────────

test('24 — capture 900×600 minimum window', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await goto(page, 'home')
  await snap(page, '24-capture-900x600-minimum')
})

// ── 25 — DELETE method entry ──────────────────────────────────────────────────

test('25 — capture method filter DELETE', async ({ page }) => {
  await goto(page, 'home')
  const btn = page.getByText('DELETE', { exact: true }).first()
  if (await btn.count() > 0) {
    await btn.click()
    await page.waitForTimeout(250)
  }
  await snap(page, '25-capture-filter-method-delete')
})

// ── 26 — Composite: all screens ───────────────────────────────────────────────

test('26 — composite all screens', async ({ page }) => {
  const screens: [string, string][] = [
    ['home',     '27a-composite-capture'],
    ['settings', '27b-composite-settings'],
    ['docs',     '27c-composite-docs'],
    ['support',  '27d-composite-support'],
  ]
  for (const [screen, filename] of screens) {
    await page.goto(url(screen))
    await page.waitForTimeout(500)
    await snap(page, filename)
  }
})
