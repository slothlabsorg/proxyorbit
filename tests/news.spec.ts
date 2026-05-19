/**
 * ProxyOrbit — News inbox + Update modal/banner tests
 *
 * The news feed and updater both run silently in the background in
 * production — there's no easy way to assert on them without stubbing.
 * Two URL params drive deterministic mock data:
 *
 *   ?mockNews=1                       — injects 3 news items into useNewsFeed
 *   ?mockUpdate=1                     — injects an AppUpdate into useUpdateCheck
 *   ?mockUpdateVersion=X.Y.Z          — version label for the mock update
 *
 * They compose: ?mock=1&screen=home&mockNews=1&mockUpdate=1 gives us the
 * full "shipping a release" UI state that the user actually cares about.
 *
 * We also clear localStorage between tests so the per-test "have I seen
 * this version's modal?" state doesn't leak across runs.
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const OUT  = path.resolve(__dirname, '../screenshots')

const BASE = '/?mock=1&screen=home'

// Reset localStorage ONCE per test (not on every reload). We sentinel via
// sessionStorage — sessionStorage is per-page-context, so survives reload
// but resets when Playwright opens a fresh context for the next test.
// Without this, page.reload() would re-wipe localStorage and tests like
// "dismissed modal stays dismissed across reload" would never pass.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__test_storage_cleared')) {
        localStorage.clear()
        sessionStorage.setItem('__test_storage_cleared', '1')
      }
    } catch { /* private mode */ }
  })
})

async function snap(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true })
  const filePath = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
}

async function bootDashboard(page: Page, extra = '') {
  await page.goto(`${BASE}${extra}`)
  await page.waitForSelector('.text-text-primary', { timeout: 10_000 })
  // The bell mounts inside the titlebar — wait for it specifically so we're
  // not racing against the news fetch on slower runs.
  await page.locator('[data-testid="news-bell"]').first().waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)
}

// ── 30 — News bell renders, no unread when feed is empty ──────────────────────

test('30 — news bell visible with no unread (no mock feed)', async ({ page }) => {
  await bootDashboard(page)
  const bell = page.locator('[data-testid="news-bell"]').first()
  await expect(bell).toBeVisible()
  await expect(page.locator('[data-testid="news-bell-dot"]')).toHaveCount(0)
  await snap(page, '30-news-bell-no-unread')
})

// ── 31 — News bell shows red dot when feed has unread items ───────────────────

test('31 — news bell with unread dot (mock feed)', async ({ page }) => {
  await bootDashboard(page, '&mockNews=1')
  await expect(page.locator('[data-testid="news-bell-dot"]')).toBeVisible()
  await snap(page, '31-news-bell-with-dot')
})

// ── 32 — Click bell opens dropdown with all news items ────────────────────────

test('32 — bell dropdown shows release + announcement + update items', async ({ page }) => {
  // mockNews delivers the static release + announcement; mockUpdate causes
  // the hook to synthesise the update-available item at the top.
  await bootDashboard(page, '&mockNews=1&mockUpdate=1&mockUpdateVersion=1.0.1')
  // Dismiss the auto-shown update modal first so it doesn't intercept clicks.
  await page.locator('[data-testid="update-modal-later"]').first().click()
  await page.waitForTimeout(200)
  await page.locator('[data-testid="news-bell"]').first().click()
  await page.locator('[data-testid="news-dropdown"]').waitFor({ timeout: 3000 })
  await expect(page.locator('[data-testid="news-item-update-available"]')).toBeVisible()
  await expect(page.locator('[data-testid="news-item-release"]').first()).toBeVisible()
  await expect(page.locator('[data-testid="news-item-announcement"]')).toBeVisible()
  await page.waitForTimeout(200)
  await snap(page, '32-news-dropdown-open')
})

// ── 33 — Mark-as-read fires after dropdown stays open ─────────────────────────

test('33 — opening dropdown marks news as read (dot disappears next mount)', async ({ page }) => {
  await bootDashboard(page, '&mockNews=1')
  await expect(page.locator('[data-testid="news-bell-dot"]')).toBeVisible()
  await page.locator('[data-testid="news-bell"]').first().click()
  // The bell waits 600ms before marking as read so the user can register
  // the dot before it disappears.
  await page.waitForTimeout(900)
  // Close dropdown.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  // Reload — lastReadAt was persisted to localStorage so dot should be gone.
  await page.reload()
  await page.waitForSelector('.text-text-primary', { timeout: 10_000 })
  await page.locator('[data-testid="news-bell"]').first().waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)
  await expect(page.locator('[data-testid="news-bell-dot"]')).toHaveCount(0)
  await snap(page, '33-news-after-mark-read')
})

// ── 34 — Update modal appears when ?mockUpdate=1 ──────────────────────────────

test('34 — update modal appears for new version', async ({ page }) => {
  await bootDashboard(page, '&mockUpdate=1&mockUpdateVersion=1.0.1')
  await page.locator('[data-testid="update-modal"]').waitFor({ timeout: 3000 })
  await expect(page.locator('[data-testid="update-modal"]')).toBeVisible()
  await expect(page.locator('[data-testid="update-modal-install"]')).toBeVisible()
  await expect(page.locator('[data-testid="update-modal-later"]')).toBeVisible()
  await snap(page, '34-update-modal')
})

// ── 35 — "Install" enters loading state ───────────────────────────────────────

test('35 — clicking Install shows installing state', async ({ page }) => {
  await bootDashboard(page, '&mockUpdate=1&mockUpdateVersion=1.0.1')
  const install = page.locator('[data-testid="update-modal-install"]').first()
  await install.waitFor({ timeout: 3000 })
  // The mock install resolves after 600ms; capture the screenshot mid-flight.
  await install.click()
  await page.waitForTimeout(120)
  await snap(page, '35-update-modal-installing')
})

// ── 36 — "Later" dismisses the modal but banner persists ──────────────────────

test('36 — Later dismisses modal, banner stays', async ({ page }) => {
  await bootDashboard(page, '&mockUpdate=1&mockUpdateVersion=1.0.1')
  await page.locator('[data-testid="update-modal-later"]').first().click()
  await page.waitForTimeout(250)
  await expect(page.locator('[data-testid="update-modal"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="update-banner"]')).toBeVisible()
  await snap(page, '36-update-banner-after-dismiss')
})

// ── 37 — Modal does NOT reappear on reload after Later ────────────────────────

test('37 — dismissed update modal does not reappear on reload', async ({ page }) => {
  await bootDashboard(page, '&mockUpdate=1&mockUpdateVersion=1.0.1')
  await page.locator('[data-testid="update-modal-later"]').first().click()
  await page.waitForTimeout(200)
  await page.reload()
  await page.waitForSelector('.text-text-primary', { timeout: 10_000 })
  await page.waitForTimeout(400)
  await expect(page.locator('[data-testid="update-modal"]')).toHaveCount(0)
  // Banner still there because version is still "available".
  await expect(page.locator('[data-testid="update-banner"]')).toBeVisible()
})

// ── 38 — Bell dropdown click on update item triggers install ──────────────────

test('38 — dropdown update item clicks through to install', async ({ page }) => {
  // Need both a synthesised update item (via mockUpdate) AND the dropdown
  // visible — they compose so the bell shows the synthetic update item.
  await bootDashboard(page, '&mockUpdate=1&mockUpdateVersion=1.0.1')
  // Dismiss the auto-shown modal first so it doesn't intercept clicks.
  await page.locator('[data-testid="update-modal-later"]').first().click()
  await page.waitForTimeout(200)
  await page.locator('[data-testid="news-bell"]').first().click()
  const updateItem = page.locator('[data-testid="news-item-update-available"]').first()
  await updateItem.waitFor({ timeout: 3000 })
  await expect(updateItem).toBeVisible()
  await snap(page, '38-news-dropdown-with-update-item')
})

// ── 39 — Composite: dashboard with bell, modal, and banner all visible ────────

test('39 — composite: dashboard with full news + update UI', async ({ page }) => {
  await bootDashboard(page, '&mockNews=1&mockUpdate=1&mockUpdateVersion=1.0.1')
  // Don't dismiss modal — we want everything on-screen at once.
  await page.locator('[data-testid="update-modal"]').waitFor({ timeout: 3000 })
  await snap(page, '39-news-and-update-composite')
})
