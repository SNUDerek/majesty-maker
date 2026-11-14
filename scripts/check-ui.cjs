/** Browser regression checks. Requires Playwright + Chromium and a running dev server.
 * Run: node scripts/check-ui.cjs [URL]. NODE_PATH may point to an existing Playwright installation.
 * Covers New Game → intro (letter reveal, reduced motion) → setup → home activities, modal focus, the Chronicle, the pilgrimage guide, parchment insets, gauges and stage scaling.
 */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

/**
 * Every visible text leaf, button, bar, image or input inside a parchment panel stays inside the
 * paper's drawn edge. The texture is stretched over the padding box, and its torn edge sits about
 * 4% in from the left, 2.5% right, 3% top and 5% bottom (measured on parchment_1600x1080.webp).
 * Left keeps 1% clearance past the edge, and nothing may start under the top-left curl
 * (about 8% of the width by 10% of the height), which scales with the panel.
 */
async function assertInsideParchment(page, where) {
  const problems = await page.evaluate(() => {
    const scale = document.querySelector('.stage').getBoundingClientRect().width / 1280;
    const out = [];
    for (const panel of document.querySelectorAll('.panel--parchment, .parchment-sheet')) {
      const r = panel.getBoundingClientRect();
      if (r.width === 0) continue;
      const cs = getComputedStyle(panel);
      const bw = (v) => parseFloat(v) * scale;
      const pad = {
        left: r.left + bw(cs.borderLeftWidth), right: r.right - bw(cs.borderRightWidth),
        top: r.top + bw(cs.borderTopWidth), bottom: r.bottom - bw(cs.borderBottomWidth),
      };
      const w = pad.right - pad.left;
      const h = pad.bottom - pad.top;
      const box = {
        left: pad.left + 0.05 * w, right: pad.right - 0.025 * w,
        top: pad.top + 0.03 * h, bottom: pad.bottom - 0.05 * h,
      };
      const curl = { right: pad.left + 0.08 * w, bottom: pad.top + 0.1 * h };
      for (const el of panel.querySelectorAll('*')) {
        const leaf = (el.children.length === 0 && el.textContent.trim() !== '') || el.matches('button, .bar, img, input, select');
        if (!leaf || el.closest('.bar') !== null && !el.matches('.bar')) continue;
        const e = el.getBoundingClientRect();
        if (e.width === 0 || e.height === 0) continue;
        const underCurl = e.left < curl.right && e.top < curl.bottom;
        if (underCurl || e.left < box.left || e.right > box.right || e.top < box.top || e.bottom > box.bottom) {
          out.push(`${panel.className.split(' ').slice(1).join('.')} > ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
        }
      }
    }
    return out;
  });
  assert.deepEqual(problems, [], `content outside the parchment insets on ${where}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    {
      // Reduced motion: whole lines, no reveal.
      const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173');
      await page.getByRole('button', { name: 'New Game', exact: true }).click();
      const line = page.locator('.intro__line');
      assert.equal(await line.evaluate((p) => p.firstChild?.textContent), await line.evaluate((p) => p.textContent));
      await context.close();
    }
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173');
      await page.getByRole('button', { name: 'New Game', exact: true }).click();
      // Intro: letters appear over time; Enter first completes the line, then advances.
      const visibleLine = () => page.evaluate(() => document.querySelector('.intro__line').firstChild?.textContent ?? '');
      const fullLine = await page.locator('.intro__line').evaluate((p) => p.textContent);
      await page.waitForTimeout(200);
      assert.ok((await visibleLine()).length < fullLine.length, 'intro text reveals letter by letter');
      await assertInsideParchment(page, 'intro');
      await page.keyboard.press('Enter');
      assert.equal(await visibleLine(), fullLine);
      await page.keyboard.press('Enter');
      await page.getByText('2 / 10').waitFor();
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
      await page.getByRole('button', { name: 'Tutoring', exact: true }).waitFor();
      await assertInsideParchment(page, 'home');
      assert.ok((await page.locator('.home-thought').innerText()).trim().length > 0);
      const thought = await page.locator('.home-thought').boundingBox();
      const portrait = await page.locator('.home-princess').boundingBox();
      assert.ok(thought.y > portrait.y + portrait.height / 2, 'thought sits near the portrait bottom');
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await assertInsideParchment(page, 'save/load');
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      // Kenney gauge fill follows the value (0–100 scale).
      const fill = await page.locator('.home-side .gauge--fatigue .bar__fill:not(.bar__fill--ghost)').getAttribute('style');
      assert.match(fill, /71%/);
      await page.getByRole('button', { name: 'Tutoring', exact: true }).click();
      await assertInsideParchment(page, 'tutoring preview');
      const gauge = page.locator('.preview .gauge').first();
      assert.match(await gauge.innerText(), /71 → 76 \/ 78/);
      assert.doesNotMatch(await gauge.innerText(), /Collapse!/);
      await page.getByRole('button', { name: 'Commit week' }).click();
      const story = page.getByRole('dialog', { name: 'Story scene' });
      await story.waitFor();
      for (let i = 0; i < 30 && await story.count(); i++) {
        const choice = story.locator('.dialog__choices button').first();
        if (await choice.count()) await choice.click();
        else await page.keyboard.press('Enter');
        await page.waitForTimeout(50);
      }
      await story.waitFor({ state: 'detached' });
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('aria-labelledby') !== null, true);
      await assertInsideParchment(page, 'result');
      assert.ok((await dialog.locator('.result__flavor').innerText()).trim().length > 0);
      assert.equal(await dialog.locator('.result__flavor').evaluate(el => getComputedStyle(el).fontStyle), 'italic');
      for (const key of ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        assert.equal(await page.evaluate(() => document.activeElement.closest('[role="dialog"]') !== null), true);
      }
      assert.equal(await page.locator('.scene').evaluate((scene) => scene.inert), true);
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.locator('.scene').evaluate((scene) => scene.inert), false);
      // Focus returns to the new screen's main action, not <body>.
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Tutoring');
      for (const kind of ['Work', 'Rest']) {
        await page.getByRole('button', { name: kind, exact: true }).click();
        if (kind === 'Rest') {
          // A falling projection announces the projected value, not the faded old one.
          const restGauge = page.locator('.preview .gauge--fatigue');
          const [, from, to] = (await restGauge.innerText()).match(/(\d+) → (\d+)/);
          assert.ok(Number(to) < Number(from));
          assert.equal(await restGauge.locator('[role="meter"]').getAttribute('aria-valuenow'), to);
        }
        await page.getByRole('button', { name: 'Commit week' }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
      }
      // The Chronicle lists three activities and the completed lesson story, newest first.
      await page.getByRole('button', { name: 'Chronicle', exact: true }).click();
      assert.equal(await page.locator('.chronicle__entry').count(), 4);
      assert.match(await page.locator('.chronicle').innerText(), /A story: The Hedge Knight's Squire/);
      assert.match(await page.locator('.chronicle__title').first().innerText(), /^Rest at Home|^Convalescence/);
      await assertInsideParchment(page, 'chronicle');
      await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
      // The first Prep visit opens the pilgrimage guide; every page stays inside the sheet.
      await page.getByRole('button', { name: 'Pilgrimage', exact: true }).click();
      const guide = page.getByRole('dialog');
      for (const title of ['The road', 'The three orders', 'Failure', 'Moon and retreat']) {
        assert.equal(await guide.locator('h2').innerText(), title);
        await assertInsideParchment(page, `tutorial: ${title}`);
        await guide.getByRole('button', { name: title === 'Moon and retreat' ? 'Done' : 'Next' }).click();
      }
      assert.equal(await page.getByRole('dialog').count(), 0);
      await assertInsideParchment(page, 'pilgrimage prep');
      await page.keyboard.press('Escape');
      // The second visit doesn't; "?" reopens it, and Escape closes it without leaving Prep.
      await page.getByRole('button', { name: 'Pilgrimage', exact: true }).click();
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: 'How the pilgrimage works' }).click();
      assert.equal(await page.getByRole('dialog').locator('h2').innerText(), 'The road');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Depart' }).count(), 1);
      await page.keyboard.press('Escape');
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
