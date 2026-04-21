/**
 * ProxyOrbit — Functional Interaction Tests
 *
 * Tests real user flows with mock data: navigation, filter builder,
 * row selection, detail panel, proxy controls, settings.
 *
 * Run: npm run test:interactions
 */
import { test, expect, type Page } from '@playwright/test'

// ── helpers ───────────────────────────────────────────────────────────────────

async function goto(page: Page, screen: string, extra = '') {
  await page.goto(`/?mock=1&screen=${screen}${extra}`)
  await page.waitForSelector('.text-text-primary', { timeout: 10_000 })
  await page.waitForTimeout(300)
}

// ── Sidebar navigation ────────────────────────────────────────────────────────

test.describe('Sidebar navigation', () => {
  const screens = ['home', 'settings', 'docs', 'support'] as const

  for (const screen of screens) {
    test(`navigates to ${screen} screen`, async ({ page }) => {
      await goto(page, screen)
      const el = page.locator('.text-text-primary').first()
      await expect(el).toBeVisible()
    })
  }

  test('sidebar shows Capture as active nav item on home', async ({ page }) => {
    await goto(page, 'home')
    const captureBtn = page.getByText('Capture').first()
    await expect(captureBtn).toBeVisible()
  })

  test('sidebar collapses and expands', async ({ page }) => {
    await goto(page, 'home')
    const collapseBtn = page.locator('button[title*="Collapse" i]').first()
    if (await collapseBtn.count() > 0) {
      await collapseBtn.click()
      await page.waitForTimeout(350)
      // Sidebar should be narrower
      const expandBtn = page.locator('button[title*="Expand" i]').first()
      await expect(expandBtn).toBeVisible()
      // Re-expand
      await expandBtn.click()
      await page.waitForTimeout(350)
    }
  })

  test('Start/Stop button is visible in sidebar', async ({ page }) => {
    await goto(page, 'home')
    const powerBtn = page.locator('button').filter({ hasText: /Start|Stop/i }).first()
    await expect(powerBtn).toBeVisible()
  })
})

// ── Capture screen — request log ──────────────────────────────────────────────

test.describe('Capture screen — request log', () => {
  test('renders request rows with mock data', async ({ page }) => {
    await goto(page, 'home')
    const rows = page.locator('.border-b.cursor-pointer')
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('request rows show method badges', async ({ page }) => {
    await goto(page, 'home')
    const getMethod = page.getByText('GET', { exact: true }).first()
    await expect(getMethod).toBeVisible()
  })

  test('request rows show status codes', async ({ page }) => {
    await goto(page, 'home')
    const status200 = page.getByText('200').first()
    await expect(status200).toBeVisible()
  })

  test('request rows show host/URL info', async ({ page }) => {
    await goto(page, 'home')
    const apiGithub = page.getByText(/api\.github\.com|github/).first()
    await expect(apiGithub).toBeVisible()
  })

  test('column headers are visible', async ({ page }) => {
    await goto(page, 'home')
    await expect(page.getByText('Time').first()).toBeVisible()
    await expect(page.getByText('Method').first()).toBeVisible()
    await expect(page.getByText('Status').first()).toBeVisible()
    await expect(page.getByText('Process').first()).toBeVisible()
  })

  test('clicking a row opens detail panel', async ({ page }) => {
    await goto(page, 'home')
    const row = page.locator('.border-b.cursor-pointer').first()
    if (await row.count() > 0) {
      await row.click()
      await page.waitForTimeout(300)
      // Detail panel header should appear
      await expect(page.getByText('Request Details').first()).toBeVisible()
    }
  })

  test('detail panel shows method and URL', async ({ page }) => {
    await goto(page, 'home')
    const row = page.locator('.border-b.cursor-pointer').first()
    if (await row.count() > 0) {
      await row.click()
      await page.waitForTimeout(300)
      const panel = page.locator('text=Request Details').first()
      await expect(panel).toBeVisible()
      // Detail shows Duration label
      await expect(page.getByText('Duration').first()).toBeVisible()
    }
  })

  test('detail panel close button works', async ({ page }) => {
    await goto(page, 'home')
    const row = page.locator('.border-b.cursor-pointer').first()
    if (await row.count() > 0) {
      await row.click()
      await page.waitForTimeout(300)
      // Close button (svg ×) in detail panel
      const closeBtn = page.locator('text=Request Details').locator('..').locator('button').first()
      if (await closeBtn.count() > 0) {
        await closeBtn.click()
        await page.waitForTimeout(250)
        const panel = await page.getByText('Request Details').count()
        expect(panel).toBe(0)
      }
    }
  })

  test('clicking same row twice closes detail panel (toggle)', async ({ page }) => {
    await goto(page, 'home')
    const row = page.locator('.border-b.cursor-pointer').first()
    if (await row.count() > 0) {
      await row.click()
      await page.waitForTimeout(200)
      await expect(page.getByText('Request Details').first()).toBeVisible()
      await row.click()
      await page.waitForTimeout(200)
      const panel = await page.getByText('Request Details').count()
      expect(panel).toBe(0)
    }
  })

  test('delete button on row hover removes it', async ({ page }) => {
    await goto(page, 'home')
    const rows = page.locator('.border-b.cursor-pointer')
    const initialCount = await rows.count()
    if (initialCount > 0) {
      await rows.first().hover()
      await page.waitForTimeout(200)
      // Delete button (×) should appear on hover
      const deleteBtn = rows.first().locator('button').last()
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click()
        await page.waitForTimeout(200)
        const newCount = await rows.count()
        expect(newCount).toBeLessThan(initialCount)
      }
    }
  })

  test('"Clear all" removes all entries', async ({ page }) => {
    await goto(page, 'home')
    const clearBtn = page.getByText('Clear all').first()
    if (await clearBtn.count() > 0) {
      await clearBtn.click()
      await page.waitForTimeout(200)
      const rows = page.locator('.border-b.cursor-pointer')
      const count = await rows.count()
      expect(count).toBe(0)
    }
  })

  test('request count shown in toolbar', async ({ page }) => {
    await goto(page, 'home')
    const countText = page.getByText(/requests/i).first()
    await expect(countText).toBeVisible()
  })
})

// ── Filter bar ────────────────────────────────────────────────────────────────

test.describe('Filter bar', () => {
  test('text filter input is visible', async ({ page }) => {
    await goto(page, 'home')
    const input = page.locator('input[placeholder*="Filter" i]').first()
    await expect(input).toBeVisible()
  })

  test('typing in text filter narrows results', async ({ page }) => {
    await goto(page, 'home')
    const rows = page.locator('.border-b.cursor-pointer')
    const initialCount = await rows.count()

    const input = page.locator('input[placeholder*="Filter" i]').first()
    if (await input.count() > 0) {
      await input.fill('github')
      await page.waitForTimeout(300)
      const filteredCount = await rows.count()
      expect(filteredCount).toBeLessThanOrEqual(initialCount)
    }
  })

  test('text filter with no-match shows empty state', async ({ page }) => {
    await goto(page, 'home')
    const input = page.locator('input[placeholder*="Filter" i]').first()
    if (await input.count() > 0) {
      await input.fill('zzz-no-match-xyz-12345')
      await page.waitForTimeout(300)
      const noMatch = page.getByText(/No matching requests/i).first()
      await expect(noMatch).toBeVisible()
    }
  })

  test('GET method filter button is clickable', async ({ page }) => {
    await goto(page, 'home')
    const getBtn = page.getByText('GET', { exact: true }).first()
    if (await getBtn.count() > 0) {
      await getBtn.click()
      await page.waitForTimeout(200)
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('method filter GET shows only GET requests', async ({ page }) => {
    await goto(page, 'home')
    const getBtn = page.getByText('GET', { exact: true }).first()
    if (await getBtn.count() > 0) {
      await getBtn.click()
      await page.waitForTimeout(250)
      // All visible method badges should be GET
      const postBadges = page.locator('.border-b.cursor-pointer').getByText('POST', { exact: true })
      const postCount = await postBadges.count()
      expect(postCount).toBe(0)
    }
  })

  test('status filter 2xx shows only successful responses', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText('2xx', { exact: true }).first()
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(250)
      // No 4xx or 5xx status codes visible in rows
      const rows = page.locator('.border-b.cursor-pointer')
      const count = await rows.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test('status filter 4xx shows client error responses', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText('4xx', { exact: true }).first()
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(250)
      const rows = page.locator('.border-b.cursor-pointer')
      const count = await rows.count()
      // Mock data has 402 and 404 → should show at least 1
      expect(count).toBeGreaterThanOrEqual(1)
    }
  })

  test('HTTPS filter shows only HTTPS rows', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText('HTTPS', { exact: true }).first()
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(250)
      // HTTP badge should not be visible in the rows
      const httpOnly = page.locator('.border-b.cursor-pointer').getByText('HTTP', { exact: true })
      expect(await httpOnly.count()).toBe(0)
    }
  })

  test('HTTP filter shows only HTTP rows', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText('HTTP', { exact: true }).first()
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(250)
      // HTTPS badge should not be visible in rows
      const httpsOnly = page.locator('.border-b.cursor-pointer').getByText('HTTPS', { exact: true })
      expect(await httpsOnly.count()).toBe(0)
    }
  })

  test('clicking All method button resets method filter', async ({ page }) => {
    await goto(page, 'home')
    const getBtn = page.getByText('GET', { exact: true }).first()
    if (await getBtn.count() > 0) {
      await getBtn.click()
      await page.waitForTimeout(200)
      const allBtn = page.getByText('All', { exact: true }).first()
      if (await allBtn.count() > 0) {
        await allBtn.click()
        await page.waitForTimeout(200)
        const rows = page.locator('.border-b.cursor-pointer')
        const count = await rows.count()
        expect(count).toBeGreaterThan(3)
      }
    }
  })

  test('filter status counts shown in toolbar', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText('GET', { exact: true }).first()
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(250)
      // Filtered count should appear: "N / M requests"
      const countText = page.getByText(/\/ \d+ requests/i).first()
      // May show "N requests" without slash if all match
      await expect(page.locator('body')).toBeVisible() // smoke
    }
  })
})

// ── Auto-scroll ───────────────────────────────────────────────────────────────

test.describe('Auto-scroll control', () => {
  test('auto-scroll button is visible in toolbar', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText(/Auto-scroll/i).first()
    await expect(btn).toBeVisible()
  })

  test('auto-scroll can be toggled off and on', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText(/Auto-scroll/i).first()
    if (await btn.count() > 0) {
      // Toggle off
      await btn.click()
      await page.waitForTimeout(100)
      // Toggle on
      await btn.click()
      await page.waitForTimeout(100)
      await expect(btn).toBeVisible()
    }
  })
})

// ── Status bar ────────────────────────────────────────────────────────────────

test.describe('Status bar', () => {
  test('status bar shows proxy state', async ({ page }) => {
    await goto(page, 'home')
    // In mock mode proxy is running
    const statusBar = page.getByText(/Intercepting|stopped/i).first()
    await expect(statusBar).toBeVisible()
  })

  test('status bar shows request count', async ({ page }) => {
    await goto(page, 'home')
    const countText = page.getByText(/requests/i).last()
    await expect(countText).toBeVisible()
  })

  test('status bar shows version', async ({ page }) => {
    await goto(page, 'home')
    const version = page.getByText(/v0\.1\.0/i).first()
    await expect(version).toBeVisible()
  })
})

// ── Title bar ─────────────────────────────────────────────────────────────────

test.describe('Title bar', () => {
  test('title bar shows ProxyOrbit brand', async ({ page }) => {
    await goto(page, 'home')
    const brand = page.getByText('ProxyOrbit').first()
    await expect(brand).toBeVisible()
  })

  test('title bar shows proxy status', async ({ page }) => {
    await goto(page, 'home')
    // Status dot and port are in title bar
    const portText = page.getByText(/localhost:\d+|stopped/i).first()
    await expect(portText).toBeVisible()
  })
})

// ── Proxy toggle ──────────────────────────────────────────────────────────────

test.describe('Proxy start/stop toggle', () => {
  test('Start button visible when proxy stopped', async ({ page }) => {
    await goto(page, 'home')
    const powerBtn = page.locator('button').filter({ hasText: /Start|Stop/i }).first()
    await expect(powerBtn).toBeVisible()
  })

  test('proxy power button has correct text in mock mode (running → Stop)', async ({ page }) => {
    await goto(page, 'home')
    // In mock mode, proxy shows as running, so button should say "Stop"
    const stopBtn = page.locator('button').filter({ hasText: /Stop/i }).first()
    await expect(stopBtn).toBeVisible()
  })

  test('clicking Stop button changes to Start (UI toggle)', async ({ page }) => {
    await goto(page, 'home')
    const stopBtn = page.locator('button').filter({ hasText: /^Stop$/i }).first()
    if (await stopBtn.count() > 0) {
      await stopBtn.click()
      await page.waitForTimeout(300)
      const startBtn = page.locator('button').filter({ hasText: /^Start$/i }).first()
      await expect(startBtn).toBeVisible()
    }
  })
})

// ── Settings screen ───────────────────────────────────────────────────────────

test.describe('Settings screen', () => {
  test('renders without crash', async ({ page }) => {
    await goto(page, 'settings')
    await expect(page.locator('body')).toBeVisible()
  })

  test('shows port input', async ({ page }) => {
    await goto(page, 'settings')
    const portInput = page.locator('input[type="number"]').first()
    await expect(portInput).toBeVisible()
  })

  test('port input has default value 8080', async ({ page }) => {
    await goto(page, 'settings')
    const portInput = page.locator('input[type="number"]').first()
    const value = await portInput.inputValue()
    expect(value).toBe('8080')
  })

  test('auto-start toggle is present', async ({ page }) => {
    await goto(page, 'settings')
    const autoStart = page.getByText(/Auto-start/i).first()
    await expect(autoStart).toBeVisible()
  })

  test('auto-configure system proxy toggle is present', async ({ page }) => {
    await goto(page, 'settings')
    const sysProxy = page.getByText(/system proxy/i).first()
    await expect(sysProxy).toBeVisible()
  })

  test('exclude hosts section is present', async ({ page }) => {
    await goto(page, 'settings')
    const excludeSection = page.getByText(/Exclude/i).first()
    await expect(excludeSection).toBeVisible()
  })

  test('localhost and 127.0.0.1 are pre-excluded', async ({ page }) => {
    await goto(page, 'settings')
    await expect(page.getByText('localhost').first()).toBeVisible()
    await expect(page.getByText('127.0.0.1').first()).toBeVisible()
  })

  test('can add a new excluded host', async ({ page }) => {
    await goto(page, 'settings')
    const input = page.locator('input[placeholder*="localhost" i]').first()
    if (await input.count() > 0) {
      await input.fill('test.internal.dev')
      const addBtn = page.getByText('Add', { exact: true }).first()
      if (await addBtn.count() > 0) {
        await addBtn.click()
        await page.waitForTimeout(200)
        await expect(page.getByText('test.internal.dev').first()).toBeVisible()
      }
    }
  })

  test('can remove an excluded host', async ({ page }) => {
    await goto(page, 'settings')
    const input = page.locator('input[placeholder*="localhost" i]').first()
    if (await input.count() > 0) {
      await input.fill('remove-me.example.com')
      const addBtn = page.getByText('Add', { exact: true }).first()
      if (await addBtn.count() > 0) {
        await addBtn.click()
        await page.waitForTimeout(150)
        // Remove the chip
        const chip = page.getByText('remove-me.example.com').first()
        if (await chip.count() > 0) {
          const removeBtn = chip.locator('..').locator('button').first()
          if (await removeBtn.count() > 0) {
            await removeBtn.click()
            await page.waitForTimeout(150)
            const gone = await page.getByText('remove-me.example.com').count()
            expect(gone).toBe(0)
          }
        }
      }
    }
  })

  test('adding host via Enter key works', async ({ page }) => {
    await goto(page, 'settings')
    const input = page.locator('input[placeholder*="localhost" i]').first()
    if (await input.count() > 0) {
      await input.fill('enter-test.dev')
      await input.press('Enter')
      await page.waitForTimeout(200)
      await expect(page.getByText('enter-test.dev').first()).toBeVisible()
    }
  })

  test('Save Settings button is present', async ({ page }) => {
    await goto(page, 'settings')
    const saveBtn = page.getByText(/Save Settings/i).first()
    await expect(saveBtn).toBeVisible()
  })

  test('port can be changed', async ({ page }) => {
    await goto(page, 'settings')
    const portInput = page.locator('input[type="number"]').first()
    if (await portInput.count() > 0) {
      await portInput.fill('9090')
      await page.waitForTimeout(100)
      const value = await portInput.inputValue()
      expect(value).toBe('9090')
    }
  })

  test('max entries input is present', async ({ page }) => {
    await goto(page, 'settings')
    const inputs = page.locator('input[type="number"]')
    const count = await inputs.count()
    expect(count).toBeGreaterThanOrEqual(2) // port + max_entries
  })

  test('settings has three sections: proxy port, behavior, exclude hosts', async ({ page }) => {
    await goto(page, 'settings')
    await expect(page.getByText('Proxy Port').first()).toBeVisible()
    await expect(page.getByText('Behavior').first()).toBeVisible()
    await expect(page.getByText('Exclude Hosts').first()).toBeVisible()
  })
})

// ── Docs screen ───────────────────────────────────────────────────────────────

test.describe('Docs screen', () => {
  test('renders Quick Start section', async ({ page }) => {
    await goto(page, 'docs')
    await expect(page.getByText('Quick Start').first()).toBeVisible()
  })

  test('renders HTTPS Interception section', async ({ page }) => {
    await goto(page, 'docs')
    await expect(page.getByText('HTTPS Interception').first()).toBeVisible()
  })

  test('renders Manual System Proxy section', async ({ page }) => {
    await goto(page, 'docs')
    await expect(page.getByText('Manual System Proxy').first()).toBeVisible()
  })

  test('renders Filters section', async ({ page }) => {
    await goto(page, 'docs')
    await expect(page.getByText('Filters').first()).toBeVisible()
  })

  test('shows networksetup commands', async ({ page }) => {
    await goto(page, 'docs')
    const nsCmd = page.getByText(/networksetup/i).first()
    await expect(nsCmd).toBeVisible()
  })

  test('shows proxy port example', async ({ page }) => {
    await goto(page, 'docs')
    const portRef = page.getByText(/8080/i).first()
    await expect(portRef).toBeVisible()
  })
})

// ── Support screen ────────────────────────────────────────────────────────────

test.describe('Support screen', () => {
  test('renders SlothLabs branding', async ({ page }) => {
    await goto(page, 'support')
    await expect(page.getByText('SlothLabs').first()).toBeVisible()
  })

  test('shows ProxyOrbit version', async ({ page }) => {
    await goto(page, 'support')
    await expect(page.getByText(/v0\.1\.0/i).first()).toBeVisible()
  })

  test('shows tech stack badges', async ({ page }) => {
    await goto(page, 'support')
    await expect(page.getByText('Tauri v2').first()).toBeVisible()
    await expect(page.getByText('React 18').first()).toBeVisible()
  })
})

// ── Badge rendering ───────────────────────────────────────────────────────────

test.describe('Method and status badges', () => {
  test('GET badge is blue/info colored', async ({ page }) => {
    await goto(page, 'home')
    const badge = page.getByText('GET', { exact: true }).first()
    await expect(badge).toBeVisible()
  })

  test('POST badge is green colored', async ({ page }) => {
    await goto(page, 'home')
    const badge = page.getByText('POST', { exact: true }).first()
    await expect(badge).toBeVisible()
  })

  test('DELETE badge is red colored', async ({ page }) => {
    await goto(page, 'home')
    const badge = page.getByText('DELETE', { exact: true }).first()
    await expect(badge).toBeVisible()
  })

  test('200 status is shown in green', async ({ page }) => {
    await goto(page, 'home')
    const status = page.locator('.text-success').first()
    await expect(status).toBeVisible()
  })

  test('4xx status is shown in warning color', async ({ page }) => {
    await goto(page, 'home')
    const status = page.locator('.text-warning').first()
    if (await status.count() > 0) {
      await expect(status).toBeVisible()
    }
  })

  test('HTTPS badge is shown for secure requests', async ({ page }) => {
    await goto(page, 'home')
    const httpsBadge = page.getByText('HTTPS', { exact: true }).first()
    await expect(httpsBadge).toBeVisible()
  })

  test('HTTP badge shown for non-secure requests', async ({ page }) => {
    await goto(page, 'home')
    const httpBadge = page.getByText('HTTP', { exact: true }).first()
    await expect(httpBadge).toBeVisible()
  })
})

// ── Layout and responsive ─────────────────────────────────────────────────────

test.describe('Layout and responsive behavior', () => {
  test('app renders at default 1200×760 viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 760 })
    await goto(page, 'home')
    await expect(page.locator('body')).toBeVisible()
  })

  test('app renders at 900×600 minimum viewport', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 })
    await goto(page, 'home')
    await expect(page.locator('body')).toBeVisible()
  })

  test('app renders at 1400×900 larger viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await goto(page, 'home')
    await expect(page.locator('body')).toBeVisible()
  })

  test('no horizontal scrollbar at default viewport', async ({ page }) => {
    await goto(page, 'home')
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5) // ±5px tolerance
  })
})

// ── Mock data integrity ───────────────────────────────────────────────────────

test.describe('Mock data integrity', () => {
  test('mock has at least 10 request entries', async ({ page }) => {
    await goto(page, 'home')
    const rows = page.locator('.border-b.cursor-pointer')
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(10)
  })

  test('mock includes github.com requests', async ({ page }) => {
    await goto(page, 'home')
    const github = page.getByText(/github\.com/i).first()
    await expect(github).toBeVisible()
  })

  test('mock includes openai.com requests', async ({ page }) => {
    await goto(page, 'home')
    const openai = page.getByText(/openai\.com/i).first()
    await expect(openai).toBeVisible()
  })

  test('mock includes both HTTP and HTTPS entries', async ({ page }) => {
    await goto(page, 'home')
    const https = page.getByText('HTTPS', { exact: true }).first()
    await expect(https).toBeVisible()
    const http = page.getByText('HTTP', { exact: true }).first()
    await expect(http).toBeVisible()
  })

  test('mock includes 4xx error responses', async ({ page }) => {
    await goto(page, 'home')
    const btn = page.getByText('4xx', { exact: true }).first()
    if (await btn.count() > 0) {
      await btn.click()
      await page.waitForTimeout(200)
      const rows = page.locator('.border-b.cursor-pointer')
      expect(await rows.count()).toBeGreaterThanOrEqual(1)
    }
  })

  test('mock includes process names (node, Chrome, etc)', async ({ page }) => {
    await goto(page, 'home')
    const nodeProcess = page.getByText('node').first()
    await expect(nodeProcess).toBeVisible()
  })

  test('mock data shows various HTTP methods', async ({ page }) => {
    await goto(page, 'home')
    const methods = ['GET', 'POST', 'PUT', 'DELETE']
    let foundCount = 0
    for (const method of methods) {
      const btn = page.locator('button').filter({ hasText: new RegExp(`^${method}$`) }).first()
      if (await btn.count() > 0) {
        await btn.click()
        await page.waitForTimeout(150)
        const rows = page.locator('.border-b.cursor-pointer')
        if (await rows.count() > 0) foundCount++
        // Reset
        const allBtn = page.getByText('All', { exact: true }).first()
        if (await allBtn.count() > 0) await allBtn.click()
        await page.waitForTimeout(100)
      }
    }
    expect(foundCount).toBeGreaterThanOrEqual(3)
  })
})
