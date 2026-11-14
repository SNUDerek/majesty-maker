import { prefersReducedMotion } from '../engine/motion.js';
import { useEffect, useRef, useState } from 'react';
import { createCampaign, getCalendar, type ZodiacSign } from '../../core/index.js';
import { BACKGROUND, IMAGES, INTRO_PANEL } from '../assets.js';
import { Button, CoinAmount, Panel } from '../components/basic.js';
import { ZodiacGlyph } from '../components/chrome.js';
import { StatBlock } from '../components/meters.js';
import { ParchmentSheet } from '../components/ParchmentSheet.js';
import { Scene } from '../components/Stage.js';
import { isLineComplete, revealPress, revealStart, revealTick, type Reveal } from '../engine/reveal.js';
import { INTRO } from '../text/intro.js';
import { ESTATES, MONTHS, SIGNS_IN_SHEET_ORDER, SIGN_LABEL } from '../text/labels.js';
import { useGame } from '../useStore.js';

export const VERSION = 'Playtest build 0.3';

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

export function TitleScreen() {
  const { store } = useGame();
  const auto = store.slots().find((s) => s.slot === 'auto');
  const canContinue = auto?.status === 'ok' && auto.compatible;
  const incompatible = auto?.status === 'ok' && !auto.compatible;
  const anySave = store.slots().some((s) => s.status !== 'empty');
  return (
    <Scene image={BACKGROUND.title}>
      <div className="title-menu">
        <h1 className="visually-hidden">The Hidden Scion</h1>
        {canContinue && <Button primary autoFocus onClick={() => store.load('auto')}>Continue</Button>}
        {incompatible && <Button disabled title="Saved under different rules; load it from Load to confirm">Continue (incompatible save)</Button>}
        <Button primary={!canContinue} autoFocus={!canContinue} onClick={() => store.setUi({ menu: 'intro' })}>New Game</Button>
        <Button disabled={!anySave} onClick={() => store.setUi({ overlay: 'saveload' })}>Load</Button>
        <Button onClick={() => store.setUi({ overlay: 'credits' })}>Credits</Button>
      </div>
      <span className="version">{VERSION} · rules “{store.config.id}”</span>
    </Scene>
  );
}

const INTRO_LINES = INTRO.map((l) => l.text);
/** Letters per second for the text reveal. */
const REVEAL_RATE = 40;
/** Picture fade duration, matching `.intro__picture` in components.css. */
const FADE_MS = 300;



/**
 * Prologue on an unframed parchment over black: picture near the top, text
 * revealed letter by letter below it. Click / Space / Enter completes the
 * line, then advances (fading the picture); Esc or Skip goes to setup.
 */
export function IntroScreen() {
  const { store } = useGame();
  const [reduced] = useState(prefersReducedMotion);
  const [reveal, setReveal] = useState<Reveal>(() => revealStart(INTRO_LINES, reduced));
  const [fading, setFading] = useState(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(fadeTimer.current), []);
  const toSetup = () => store.setUi({ menu: 'setup' });
  const line = INTRO[reveal.index]!;
  const complete = isLineComplete(reveal, INTRO_LINES);

  useEffect(() => {
    if (complete || fading) return undefined;
    const id = setInterval(() => setReveal((r) => revealTick(r, INTRO_LINES)), 1000 / REVEAL_RATE);
    return () => clearInterval(id);
  }, [complete, fading, reveal.index]);

  const press = () => {
    if (fading) return;
    const next = revealPress(reveal, INTRO_LINES, reduced);
    if (next === 'done') { toSetup(); return; }
    if (next.index === reveal.index || reduced) { setReveal(next); return; }
    // Fade the picture out, swap the line, fade back in.
    setFading(true);
    fadeTimer.current = setTimeout(() => { setReveal(next); setFading(false); }, FADE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toSetup();
      else if ((e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); press(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const last = reveal.index + 1 >= INTRO.length;
  return (
    <div className="intro-stage">
      <ParchmentSheet className="intro">
        <button type="button" className="intro__picture-button" onClick={press} aria-label={complete ? 'Next' : 'Show the whole line'}>
          <img key={line.panel} className={`intro__picture ${fading ? 'intro__picture--out' : ''}`}
            src={INTRO_PANEL[line.panel]} alt="" />
        </button>
        <p className="visually-hidden" aria-live="polite">{line.text}</p>
        <p className="intro__line" aria-hidden="true">
          {line.text.slice(0, reveal.shown)}
          <span className="intro__unrevealed">{line.text.slice(reveal.shown)}</span>
        </p>
        <div className="intro__actions">
          <span className="muted">{reveal.index + 1} / {INTRO.length}</span>
          <Button onClick={toSetup}>Skip</Button>
          <Button primary autoFocus onClick={press}>{last && complete ? 'Begin' : 'Next'}</Button>
        </div>
      </ParchmentSheet>
    </div>
  );
}

export function SetupScreen() {
  const { store, snap } = useGame();
  const [scionName, setScion] = useState('Elaine');
  const [first, setFirst] = useState('Aldous');
  const [last, setLast] = useState('Wyke');
  const [sign, setSign] = useState<ZodiacSign>('aries');
  // Starting stats come from the engine, never a frontend formula.
  const preview = createCampaign({ seed: 1, birthSign: sign, playerName: { first, last }, scionName }, store.config);
  const start = getCalendar(preview, store.config);
  const valid = scionName.trim() !== '' && first.trim() !== '';
  const begin = () => store.newGame({
    seed: snap.ui.devSeed ?? randomSeed(),
    birthSign: sign,
    playerName: { first: first.trim(), last: last.trim() },
    scionName: scionName.trim(),
  });
  return (
    <Scene image={BACKGROUND.home}>
      <img className="home-princess" src={IMAGES.princessFull} alt="" />
      <Panel variant="parchment" className="setup panel--tall panel--wide" title="Before the tale begins">
        <div className="setup__names">
          <label className="field"><span>Her name</span>
            <input value={scionName} maxLength={24} onChange={(e) => setScion(e.target.value)} autoFocus /></label>
          <label className="field"><span>Your name</span>
            <input value={first} maxLength={24} onChange={(e) => setFirst(e.target.value)} aria-label="Your first name" /></label>
          <label className="field"><span>House</span>
            <input value={last} maxLength={24} onChange={(e) => setLast(e.target.value)} aria-label="Your family name" /></label>
        </div>
        <fieldset className="signs">
          <legend>Her birth sign (she starts in its month)</legend>
          {SIGNS_IN_SHEET_ORDER.map((s) => (
            <label key={s} className={`sign ${s === sign ? 'sign--on' : ''}`}>
              <input type="radio" name="sign" value={s} checked={s === sign} onChange={() => setSign(s)} className="visually-hidden" />
              <ZodiacGlyph sign={s} height={56} />
              <span>{SIGN_LABEL[s]}</span>
            </label>
          ))}
        </fieldset>
        <div className="setup__preview">
          <div>{ESTATES.map((e) => <StatBlock key={e} estate={e} value={preview.stats[e]} />)}</div>
          <div>
            <p>Treasury <CoinAmount amount={preview.treasury} /></p>
            <p className="muted">
              She is {start.age}. The tale begins in {MONTHS[start.currentMonth]} {start.displayYear};
              the Conjunction comes in {start.weeksRemaining} weeks.
            </p>
          </div>
        </div>
        <div className="preview__actions">
          <Button onClick={() => store.setUi({ menu: 'title' })}>Back</Button>
          <Button primary disabled={!valid} onClick={begin}>Begin</Button>
        </div>
      </Panel>
    </Scene>
  );
}
