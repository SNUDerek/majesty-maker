/** Requires Playwright and a running dev server. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    for (const reducedMotion of ['reduce', 'no-preference']) {
      const page = await browser.newPage({ reducedMotion });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${process.argv[2] || 'http://127.0.0.1:5182'}/?gallery`);
      await page.getByRole('button', { name: 'Play scene' }).click();
      const dialog = page.getByRole('dialog', { name: 'Story scene' });
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /A steady hand, Elaine/);
      await page.keyboard.press('Enter');
      assert.match(await dialog.innerText(), /He makes it sound so easy/);
      await page.keyboard.press('Space');
      assert.match(await dialog.innerText(), /courtyard falls silent/);
      await dialog.getByRole('button', { name: 'Advance dialog' }).click();
      assert.match(await dialog.innerText(), /Shall we try a bout/);
      assert.equal(await page.locator('.dialog__portrait--right').evaluate(el => getComputedStyle(el).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
      await page.keyboard.press('Enter');
      await dialog.getByRole('button', { name: 'Ask for advice' }).click();
      assert.match(await dialog.innerText(), /Show me how you hold your guard/);
      await page.keyboard.press('Enter');
      assert.match(await dialog.innerText(), /Enough chatter/);
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Play scene' }).click();
      assert.match(await dialog.innerText(), /A steady hand, Elaine/);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Dialog browser checks passed (normal and reduced motion).');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
