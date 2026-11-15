/**
 * Dialog scenes and story beats in the browser. Requires Playwright and a
 * running dev server: `node scripts/check-dialog.cjs [URL]`.
 * Uses the placeholder beats in content/story (knight_1, father_1).
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:5182';

/** Advances with Enter until a choice appears or the scene closes. */
async function advance(page, dialog) {
  for (let i = 0; i < 30; i++) {
    if (await dialog.count() === 0) return 'closed';
    if (await dialog.locator('.dialog__choices').count() > 0) return 'choice';
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
  }
  throw new Error('scene did not end');
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    for (const reducedMotion of ['reduce', 'no-preference']) {
      const page = await browser.newPage({ reducedMotion, viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));

      // Gallery preview: plays any scene without its conditions.
      await page.goto(`${BASE}/?gallery`);
      await page.getByRole('combobox').selectOption('knight.ink/knight_1');
      await page.getByRole('button', { name: 'Play scene' }).click();
      const dialog = page.getByRole('dialog', { name: 'Story scene' });
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /You hold that sword like a ladle, Elaine/);
      assert.equal(await advance(page, dialog), 'choice');
      assert.equal(await page.locator('.dialog__portrait--right').evaluate((el) => getComputedStyle(el).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
      await dialog.getByRole('button', { name: 'Ignore him' }).click();
      assert.match(await dialog.innerText(), /Better not to rise to it/);
      assert.equal(await advance(page, dialog), 'closed');

      // A new game: the Talk with her button is open and the daughter hints at it.
      await page.goto(BASE);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.getByRole('button', { name: 'New Game', exact: true }).click();
      await page.getByRole('button', { name: 'Skip', exact: true }).click();
      await page.getByRole('button', { name: 'Begin', exact: true }).click();
      const social = page.getByRole('button', { name: 'Talk with her', exact: true });
      await social.waitFor();
      assert.equal(await social.isEnabled(), true);
      assert.match(await page.locator('.home-thought').innerText(), /something on my mind/);
      assert.equal(await page.locator('.home-thought--talk').count(), 1, 'a ready talk turns the thought red');
      if (reducedMotion === 'reduce') await page.screenshot({ path: process.env.SHOT || 'home-talk.png' });
      const week = await page.locator('.topbar').first().innerText();
      await social.click();
      await dialog.waitFor();
      assert.equal(await page.locator('.scene').evaluate(el => el.inert), true, 'background is inert during story');
      for (const key of ['Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      }
      assert.match(await dialog.innerText(), /Father\? Can I ask you something/);
      assert.equal(await advance(page, dialog), 'closed');
      assert.equal(await page.getByRole('dialog').count(), 0, 'a talk shows no result panel');
      assert.equal(await page.locator('.topbar').first().innerText(), week, 'a talk spends no week');
      assert.equal(await social.isEnabled(), false);
      assert.equal(await page.locator('.home-thought--talk').count(), 0, 'no red thought without a talk');
      assert.equal(await page.locator('.scene').evaluate(el => el.inert), false, 'background is restored after story');

      // A lesson with the Hedge Knight plays knight_1, then the result panel.
      await page.getByRole('button', { name: 'Tutoring', exact: true }).click();
      await page.getByText('The Hedge Knight').first().click();
      await page.getByRole('button', { name: 'Commit week' }).click();
      await dialog.waitFor();
      assert.match(await dialog.innerText(), /like a ladle/);
      assert.equal(await advance(page, dialog), 'choice');
      await dialog.getByRole('button', { name: 'Accept the challenge' }).click();
      assert.equal(await advance(page, dialog), 'closed');
      const result = page.getByRole('dialog');
      await result.waitFor();
      assert.match(await result.innerText(), /Lessons with The Hedge Knight/);
      await result.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Chronicle', exact: true }).click();
      assert.match(await page.getByRole('dialog').innerText(), /A story: The Hedge Knight's Squire/);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Dialog and story beat browser checks passed (normal and reduced motion).');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
