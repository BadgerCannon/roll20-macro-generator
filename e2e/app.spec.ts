import { expect, test, type Page } from '@playwright/test';

/** Replaces the editor contents (insertText avoids bracket auto-closing). */
async function setDsl(page: Page, text: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

const NESTED = `macros:
  check:
    queries:
      bonus: { prompt: Bonus, default: 0 }
    choose:
      prompt: Roll
      layout: compact
      options:
        - { label: STR, value: '/roll 1d20 + @{STR} + \${bonus}' }
        - { label: DEX, value: '/roll 1d20 + @{DEX} + \${bonus}' }
`;
const NESTED_OUT =
  '?{Roll|STR,/roll 1d20 + @{STR} + ?{Bonus&#124;0&#125;|DEX,/roll 1d20 + @{DEX} + ?{Bonus&#124;0&#125;}';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('shows the basics example on first visit', async ({ page }) => {
  await expect(page.locator('.card')).toHaveCount(4);
  await expect(page.locator('.card h3').first()).toHaveText('initiative');
  await expect(page.locator('.card pre').first()).toContainText('&{tracker}');
});

test('renders DSL as it is typed, with escaping', async ({ page }) => {
  await setDsl(page, NESTED);
  await expect(page.locator('.card pre')).toHaveText([NESTED_OUT]);
});

test('copies a macro to the clipboard', async ({ page }) => {
  await setDsl(page, NESTED);
  await expect(page.locator('.card pre')).toHaveText([NESTED_OUT]);
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(NESTED_OUT);
});

test('shows diagnostics and jumps to the line', async ({ page }) => {
  await setDsl(page, 'macros:\n  m:\n    body: "[[@{target|HP|max}]]"\n');
  const diag = page.locator('.card .diags li.error');
  await expect(diag).toContainText('needs a target label');
  await diag.getByRole('button', { name: /line \d+/ }).click();
  await expect(page.locator('.cm-lint-marker-error')).toBeVisible();
});

test('keeps history across reloads: save, restore, rename, delete', async ({ page }) => {
  await setDsl(page, NESTED);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#status')).toContainText('Saved "check"');

  await page.reload();
  // The draft survives the reload.
  await expect(page.locator('.card pre')).toHaveText([NESTED_OUT]);

  await setDsl(page, 'macros:\n  other:\n    body: hi\n');
  await expect(page.locator('.card h3')).toHaveText(['other']);

  await page.getByRole('button', { name: 'History' }).click();
  const item = page.locator('#history-list li');
  await expect(item).toHaveCount(1);
  await expect(item.locator('.title')).toHaveText('check');

  page.once('dialog', (d) => d.accept('Bonus check'));
  await item.getByRole('button', { name: 'Rename' }).click();
  await expect(item.locator('.title')).toHaveText('Bonus check');

  page.once('dialog', (d) => d.accept());
  await item.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.card pre')).toHaveText([NESTED_OUT]);

  await page.getByRole('button', { name: 'History' }).click();
  page.once('dialog', (d) => d.accept());
  await item.getByRole('button', { name: 'Delete' }).click();
  await expect(item).toHaveCount(0);
  await expect(page.locator('#history-empty')).toBeVisible();
});

test('share link restores the DSL', async ({ page, context }) => {
  await setDsl(page, NESTED);
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page).toHaveURL(/#src=/);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.locator('.card pre')).toHaveText([NESTED_OUT]);
});

test('works when browser storage is blocked', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('.card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#status')).toContainText('browser storage is not available');
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.locator('#storage-warning')).toBeVisible();
  await context.close();
});

test('screenshots at desktop and phone widths', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await info.attach('desktop', { body: await page.screenshot(), contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await info.attach('phone', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
