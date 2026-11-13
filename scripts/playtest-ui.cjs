/** Plays one whole campaign through the real UI, clicking only what a player sees (U8 playtest pass).
 * Requires Playwright + Chromium and a running dev server (`npm run dev`).
 * Run: node scripts/playtest-ui.cjs [--seed N] [--size 1280x720] [--home-only] [--shots DIR] [--url URL]
 * NODE_PATH may point to an existing Playwright installation. Prints the outcome and exits 1 on page errors
 * or if the bot gets stuck. --home-only never departs, to reach the deadline.
 */
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const seed = opt('--seed', '101');
const [w, h] = opt('--size', '1280x720').split('x');
const out = opt('--shots', null);
const url = opt('--url', 'http://127.0.0.1:5173/');
const homeOnly = args.includes('--home-only');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: +w, height: +h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}?dev`);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.click('.dev-toggle'); await page.fill('.dev input[type=number]', seed); await page.click('.dev button:has-text("×")');
  await page.click('button:has-text("New Game")'); await page.click('button:has-text("Skip")');
  await page.click('label.sign:has-text("Leo")'); await page.click('button:has-text("Begin")');
  const titles = []; let week = 0; const shots = new Set();
  const shot = async (name) => {
    if (out === null || shots.has(name)) return;
    shots.add(name);
    await page.screenshot({ path: `${out}/playtest-${w}-${name}.png` });
  };
  let stuck = false;
  let completed = false;
  for (let step = 0; step < 3000; step++) {
    await page.waitForTimeout(30);
    const modal = page.locator('.result');
    if (await modal.count()) {
      const t = await modal.locator('h2').first().innerText(); titles.push(t);
      if (/Wipeout|Victory|Waystation|collapse/.test(t)) await shot(t.replace(/\W+/g, '_').slice(0, 30));
      await page.keyboard.press('Enter'); continue;
    }
    if (await page.locator('text=The Scion is crowned').count() || await page.locator('text=The Conjunction has come').count()) {
      await shot('outcome'); completed = true; break;
    }
    if (await page.locator('.approach').count()) {
      await shot('encounter');
      const odds = await page.locator('.approach__odds').allInnerTexts();
      const wipes = await page.locator('.approach').evaluateAll((els) => els.map((e) => /wipeout/.test(e.textContent)));
      let best = 0; odds.forEach((o, i) => { if ((wipes[best] && !wipes[i]) || (parseInt(o) > parseInt(odds[best]) && !wipes[i])) best = i; });
      await page.locator('.approach').nth(best).click(); continue;
    }
    if (await page.locator('text=A failed roll').count()) { await page.click('button:has-text("Accept failure")'); continue; }
    const warn = await page.locator('.hud .gauge--warning').count().then((n) => n > 0);
    if (await page.locator('text=Press on, or turn back').count()) {
      if (warn) { await page.click('button:has-text("Retreat home")'); await shot('retreat'); await page.click('.modal-backdrop button:has-text("Retreat")'); }
      else await page.click('button:has-text("Press on")');
      continue;
    }
    if (await page.locator('text=secured').count()) {
      await shot('waystation');
      const cont = page.locator('.road-actions button.btn--primary');
      if (!warn && await cont.count()) await cont.click(); else await page.click('button:has-text("Return home")');
      continue;
    }
    if (await page.locator('text=How shall she spend this week').count()) {
      await shot('hub');
      week++;
      if (await page.locator('button:has-text("Rest at home")').count()) { await page.click('button:has-text("Rest at home")'); continue; }
      const sideWarn = await page.locator('.home-side .gauge--warning').count();
      const vals = await page.locator('.home-side .gauge__head .num').allInnerTexts();
      const ratio = Math.max(...vals.map((v) => { const [a, b] = v.split('/').map((x) => parseInt(x)); return a / b; }));
      const treasury = parseInt(await page.locator('.topbar .coin').first().innerText());
      const pilgrim = page.locator('.home-menu button:has-text("Pilgrimage")');
      if (!homeOnly && ratio < 0.35 && week > 40 && week % 3 === 0 && await pilgrim.isEnabled()) {
        await pilgrim.click(); await shot('prep'); await page.click('.presets button:has-text("½")'); await page.click('button:has-text("Depart")'); continue;
      }
      const kind = sideWarn || ratio > 0.55 ? 'Rest' : treasury < 45 ? 'Work' : 'Tutoring';
      await page.click(`.home-menu button:has-text("${kind}")`);
      const cards = page.locator('.card:not(.card--disabled)');
      const n = await cards.count();
      if (kind === 'Tutoring' && n > 0) await cards.nth(week % n).click();
      else if (kind === 'Rest' && n > 0) await cards.nth(n - 1).click();
      else if (n > 0) await cards.nth(week % n).click();
      await shot(`activity-${kind}`);
      await page.click('button:has-text("Commit week")'); continue;
    }
    await shot(`stuck-${step}`); console.log('stuck at step', step); stuck = true; break;
  }
  const outcome = (await page.locator('.centre-panel h2').first().innerText().catch(() => '?'));
  console.log(`${w}x${h} seed ${seed}: ${outcome}; results ${titles.length}; wins ${titles.filter((t) => t.startsWith('Encounter won')).length}; wipeouts ${titles.filter((t) => t === 'Wipeout').length}; errors ${JSON.stringify(errors)}`);
  await browser.close();
  if (!completed || stuck || errors.length > 0) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
