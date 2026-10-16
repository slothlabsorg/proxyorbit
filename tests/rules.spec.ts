/**
 * ProxyOrbit — Rewrite Rules UI Tests
 *
 * Exercises the Rules screen in mock mode: list rendering, toggle, add,
 * edit (all action types), and delete. Mock mode (?mock=1) means no backend
 * calls fire — pure UI verification.
 *
 * Run: npx playwright test tests/rules.spec.ts --project=rules
 */
import { test, expect, type Page } from '@playwright/test'

async function gotoRules(page: Page) {
  await page.goto('/?mock=1&screen=rules')
  await page.waitForSelector('[data-testid="rules-list"]', { timeout: 10_000 })
  await page.waitForTimeout(200)
}

test.describe('Rewrite Rules screen', () => {
  test('renders the starter example rules', async ({ page }) => {
    await gotoRules(page)
    await expect(page.getByText('Example — serve a local file instead of a CDN asset')).toBeVisible()
    await expect(page.getByText('Example — rewrite a field in a JSON response')).toBeVisible()
  })

  test('serve-local-file rule shows its action + path', async ({ page }) => {
    await gotoRules(page)
    const rule = page.locator('[data-testid="rule-example-serve-local-file"]')
    await expect(rule).toBeVisible()
    await expect(rule.getByText('Serve local file')).toBeVisible()
    await expect(rule.getByText(/bundle\.js/)).toBeVisible()
  })

  test('toggle flips a rule enabled state', async ({ page }) => {
    await gotoRules(page)
    const toggle = page.locator('[data-testid="toggle-example-serve-local-file"]')
    await toggle.click()
    await expect(page.locator('[data-testid="rules-saved"]')).toBeVisible()
  })

  test('add rule opens the editor', async ({ page }) => {
    await gotoRules(page)
    await page.locator('[data-testid="add-rule"]').click()
    await expect(page.locator('[data-testid="rule-editor"]')).toBeVisible()
    await expect(page.locator('[data-testid="edit-name"]')).toBeVisible()
  })

  test('create a ServeLocalFile rule end-to-end', async ({ page }) => {
    await gotoRules(page)
    await page.locator('[data-testid="add-rule"]').click()

    await page.locator('[data-testid="edit-name"]').fill('My local override')
    await page.locator('[data-testid="edit-host"]').fill('cdn.example.com')
    await page.locator('[data-testid="edit-path"]').fill('/dist/app.js')
    await page.locator('[data-testid="edit-action-type"]').selectOption('serve_local_file')
    await page.locator('[data-testid="edit-file-path"]').fill('/tmp/app.js')
    await page.locator('[data-testid="edit-save"]').click()

    await expect(page.getByText('My local override')).toBeVisible()
    await expect(page.getByText('/tmp/app.js')).toBeVisible()
  })

  test('create a RewriteResponseBody rule with replacements', async ({ page }) => {
    await gotoRules(page)
    await page.locator('[data-testid="add-rule"]').click()

    await page.locator('[data-testid="edit-name"]').fill('Flip mode')
    await page.locator('[data-testid="edit-host"]').fill('api.example.com')
    await page.locator('[data-testid="edit-action-type"]').selectOption('rewrite_response_body')
    await page.locator('[data-testid="edit-replace-from-0"]').fill('"mode":"a"')
    await page.locator('[data-testid="edit-replace-to-0"]').fill('"mode":"b"')
    await page.locator('[data-testid="edit-save"]').click()

    await expect(page.getByText('Flip mode').first()).toBeVisible()
  })

  test('create a MockResponse rule', async ({ page }) => {
    await gotoRules(page)
    await page.locator('[data-testid="add-rule"]').click()

    await page.locator('[data-testid="edit-name"]').fill('Mock endpoint')
    await page.locator('[data-testid="edit-host"]').fill('api.example.com')
    await page.locator('[data-testid="edit-action-type"]').selectOption('mock_response')
    await page.locator('[data-testid="edit-mock-status"]').fill('200')
    await page.locator('[data-testid="edit-mock-body"]').fill('{"ok":true}')
    await page.locator('[data-testid="edit-save"]').click()

    await expect(page.getByText('Mock endpoint')).toBeVisible()
  })

  test('delete removes a rule', async ({ page }) => {
    await gotoRules(page)
    const rule = page.locator('[data-testid="rule-example-serve-local-file"]')
    await expect(rule).toBeVisible()
    await page.locator('[data-testid="delete-example-serve-local-file"]').click()
    await expect(rule).not.toBeVisible()
  })

  test('edit an existing rule changes its action type', async ({ page }) => {
    await gotoRules(page)
    await page.locator('[data-testid="edit-example-rewrite-response"]').click()
    await expect(page.locator('[data-testid="rule-editor"]')).toBeVisible()
    await page.locator('[data-testid="edit-action-type"]').selectOption('redirect')
    await page.locator('[data-testid="edit-redirect-url"]').fill('http://localhost:3000/api')
    await page.locator('[data-testid="edit-save"]').click()
    const rule = page.locator('[data-testid="rule-example-rewrite-response"]')
    await expect(rule.getByText('Redirect')).toBeVisible()
  })
})
