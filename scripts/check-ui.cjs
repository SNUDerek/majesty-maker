/** Browser regression checks. Requires Playwright + Chromium and a running dev server.
 * Run: node scripts/check-ui.cjs [URL]. NODE_PATH may point to an existing Playwright installation.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173');
      await page.getByRole('button', { name: 'New Game', exact: true }).click();
      await page.getByRole('button', { name: 'Skip', exact: true }).click();
      await page.getByRole('button', { name: 'Begin', exact: true }).click();
      await page.getByRole('button', { name: 'Tutoring', exact: true }).waitFor();
      await page.evaluate(() => {
        const save = JSON.parse(localStorage.getItem('hidden-scion:auto'));
        Object.assign(save.state, { birthSign: 'aries', elapsedWeeks: 1, fatigue: 71 });
        save.state.stats.bellatores = 15;
        localStorage.setItem('hidden-scion:auto', JSON.stringify(save));
      });
      await page.reload();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Tutoring', exact: true }).click();
      const gauge = page.locator('.preview .gauge').first();
      assert.match(await gauge.innerText(), /71 → 76 \/ 78/);
      assert.doesNotMatch(await gauge.innerText(), /Collapse!/);
      await page.getByRole('button', { name: 'Commit week' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-labelledby') !== null, true);
      for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        assert.equal(await page.evaluate(() => document.activeElement.closest('[role="dialog"]') !== null), true);
      }
      assert.equal(await page.locator('.scene').evaluate((scene) => scene.inert), true);
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.locator('.scene').evaluate((scene) => scene.inert), false);
      for (const kind of ['Work', 'Rest']) {
        await page.getByRole('button', { name: kind, exact: true }).click();
        await page.getByRole('button', { name: 'Commit week' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
      }
      const stage = await page.locator('.stage').boundingBox();
      assert.equal(Math.round(stage.width), viewport.width);
      assert.equal(Math.round(stage.height), viewport.height);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`UI regression checks passed at ${viewport.width}×${viewport.height}`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
