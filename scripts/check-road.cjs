/** Targeted pilgrimage UI regressions using engine-generated save fixtures.
 * Requires the Vite dev server, Playwright and Chromium. Run: node scripts/check-road.cjs [URL].
 * NODE_PATH may point to an existing Playwright installation.
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
    async function loadFixture(mode) {
      await page.evaluate(async (mode) => {
        const { createCampaign, applyAction } = await import('/src/core/index.ts');
        const { CONFIG_LOADERS } = await import('/src/ui/config.ts');
        const { writeSave } = await import('/src/ui/engine/persistence.ts');
        const config = CONFIG_LOADERS['default+items']();
        for (let seed = 1; seed <= 100; seed++) {
          let state = createCampaign({ seed, birthSign: 'aries', scionName: 'Elaine', playerName: { first: 'A', last: 'B' } }, config);
          if (mode === 'reroll') state.fatigue = 79;
          else { state.stats = { bellatores: 100, oratores: 100, laboratores: 100 }; state.fatigue = 40; }
          state = applyAction(state, { type: 'BEGIN_PILGRIMAGE', carry: 20,
            consumableId: mode === 'reroll' ? 'metheglin' : 'theriac' }, config).state;
          if (mode !== 'skip') state = applyAction(state, { type: 'CHOOSE_APPROACH', estate: 'bellatores' }, config).state;
          const expected = mode === 'reroll' ? 'reroll_or_accept' : mode === 'skip' ? 'choose_approach' : 'continue_or_retreat';
          if (state.pilgrimage?.stage !== expected) continue;
          writeSave(localStorage, 'auto', state, config, new Date());
          return;
        }
        throw new Error(`No fixture for ${mode}`);
      }, mode);
      await page.reload();
      await page.locator('.dev-toggle').click();
      await page.locator('.dev select').selectOption('default+items');
      await page.locator('.dev button').filter({ hasText: '×' }).click();
      await button('Continue').click();
    }
    await loadFixture('reroll');
    await page.getByRole('button', { name: /^Drink Metheglin/ }).click();
    await page.locator('.result').waitFor();
    assert.match(await page.locator('.result').innerText(), /Metheglin reroll/);
    await loadFixture('reroll');
    await page.getByRole('button', { name: /^Accept failure/ }).click();
    assert.equal(await page.locator('.result h2').innerText(), 'Wipeout');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    await page.locator('.home-menu').waitFor();
    await loadFixture('retreat');
    await button('Use Theriac').click();
    assert.equal(await page.locator('.result').count(), 0);
    assert.match(await page.locator('.hud .gauge').first().innerText(), /10 \/ 100/);
    await button('Retreat home').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retreat', exact: true }).click();
    assert.equal(await page.locator('.result h2').innerText(), 'Retreat');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    await page.locator('.home-menu').waitFor();
    await loadFixture('skip');
    await page.getByRole('button', { name: /^Bribe past/ }).click();
    assert.match(await page.locator('.result h2').innerText(), /Slipped past under the New Moon/);
    assert.deepEqual(errors, []);
    console.log('Reroll, failure acceptance/wipeout, remedy, retreat, and New Moon bribe checks passed');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
