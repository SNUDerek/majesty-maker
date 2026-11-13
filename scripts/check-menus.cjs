/** Save/load and keyboard regressions. Requires Playwright/Chromium and a running dev server.
 * Run: node scripts/check-menus.cjs [URL]; NODE_PATH may point to an existing Playwright installation.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5173');
    url.searchParams.set('dev', '');
    await page.goto(url.href);
    const button = (name) => page.getByRole('button', { name, exact: true });
    const slot = (index) => page.locator('.slot').nth(index);
    const focused = () => page.evaluate(() => document.activeElement.textContent);
    await button('New Game').click(); await button('Skip').click(); await button('Begin').click();
    await button('Menu').click();
    await slot(1).getByRole('button', { name: 'Save', exact: true }).click();
    await slot(1).getByRole('button', { name: 'Save', exact: true }).click();
    assert.equal(await focused(), 'Yes');
    await page.keyboard.press('Shift+Tab'); assert.equal(await focused(), 'Cancel');
    await page.keyboard.press('Enter');
    assert.equal(await focused(), 'Close');
    await slot(1).getByRole('button', { name: 'Delete', exact: true }).click();
    assert.equal(await focused(), 'Yes');
    await button('Cancel').click();
    await button('Close').click();
    await button('Pilgrimage').click(); await button('Depart').click();
    await button('Menu').click();
    await slot(2).getByRole('button', { name: 'Save', exact: true }).click();
    await slot(1).getByRole('button', { name: 'Load', exact: true }).click();
    await page.locator('.home-menu').waitFor();
    await button('Menu').click();
    await slot(2).getByRole('button', { name: 'Load', exact: true }).click();
    assert.equal(await page.locator('.approach').count(), 3);
    await page.locator('.dev-toggle').click();
    const before = await page.evaluate(() => localStorage.getItem('hidden-scion:auto'));
    await page.locator('.dev input').focus(); await page.keyboard.type('123');
    assert.equal(await page.locator('.result').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('hidden-scion:auto')), before);
    await page.locator('.dev input').fill('');
    assert.equal(await page.locator('.dev input').inputValue(), '');
    await page.locator('.dev button').filter({ hasText: '×' }).click();
    // Incompatible saves still require an explicit confirmation, with focus inside it.
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('hidden-scion:slot2'));
      save.configHash = 'different';
      localStorage.setItem('hidden-scion:slot3', JSON.stringify(save));
    });
    await button('Menu').click();
    await slot(3).getByRole('button', { name: 'Load', exact: true }).click();
    assert.equal(await focused(), 'Yes');
    await button('Cancel').click(); await button('Close').click();
    // A corrupt-only library must remain accessible for deletion.
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hidden-scion:auto', '{broken'); });
    await page.reload();
    assert.equal(await button('Load').isEnabled(), true);
    await button('Load').click();
    await slot(0).getByRole('button', { name: 'Delete', exact: true }).click();
    assert.equal(await focused(), 'Yes');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => localStorage.getItem('hidden-scion:auto')), null);
    assert.equal(await focused(), 'Close');
    assert.deepEqual(errors, []);
    console.log('Save/load, confirmation focus, corrupt-save recovery, and dev-input checks passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
