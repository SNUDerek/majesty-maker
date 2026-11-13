import { useEffect, useState } from 'react';
import { createCampaign, getCalendar, type ZodiacSign } from '../../core/index.js';
import { BACKGROUND, IMAGES, INTRO_PANEL } from '../assets.js';
import { Button, CoinAmount, Panel } from '../components/basic.js';
import { ZodiacGlyph } from '../components/chrome.js';
import { StatBlock } from '../components/meters.js';
import { Scene } from '../components/Stage.js';
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

export function IntroScreen() {
  const { store } = useGame();
  const [index, setIndex] = useState(0);
  const toSetup = () => store.setUi({ menu: 'setup' });
  const next = () => (index + 1 < INTRO.length ? setIndex(index + 1) : toSetup());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toSetup();
      else if ((e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const line = INTRO[index]!;
  return (
    <Scene image={BACKGROUND.title} scrim>
      <div className="intro">
        <button type="button" className="intro__panel" onClick={next} aria-label="Next">
          <img src={INTRO_PANEL[line.panel]} alt="" />
        </button>
        <Panel variant="parchment" className="intro__text">
          <p aria-live="polite">{line.text}</p>
          <div className="intro__actions">
            <span className="muted">{index + 1} / {INTRO.length}</span>
            <Button onClick={toSetup}>Skip</Button>
            <Button primary autoFocus onClick={next}>{index + 1 < INTRO.length ? 'Next' : 'Begin'}</Button>
          </div>
        </Panel>
      </div>
    </Scene>
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
      <Panel variant="parchment" className="setup" title="Before the tale begins">
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
