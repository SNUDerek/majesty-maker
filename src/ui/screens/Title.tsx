import type { ZodiacSign } from '../../core/index.js';
import { BACKGROUND } from '../assets.js';
import { Button } from '../components/basic.js';
import { Scene } from '../components/Stage.js';
import { readSlot } from '../engine/persistence.js';
import { SIGNS_IN_SHEET_ORDER } from '../text/labels.js';
import { useGame } from '../useStore.js';
import { browserStorage } from '../storage.js';

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

/**
 * Interim title screen for the home-loop build: New Game uses default names
 * and a random sign. The full Title / Intro / Setup flow is U7.
 */
export function TitleScreen() {
  const { store } = useGame();
  const storage = browserStorage();
  const auto = storage === null ? null : readSlot(storage, 'auto', store.config);
  const canContinue = auto?.status === 'ok' && auto.compatible;
  const newGame = () => {
    const sign: ZodiacSign = SIGNS_IN_SHEET_ORDER[randomSeed() % 12]!;
    store.newGame({ seed: randomSeed(), birthSign: sign, playerName: { first: 'Aldous', last: 'Wyke' }, scionName: 'Elaine' });
  };
  return (
    <Scene image={BACKGROUND.title}>
      <div className="title-menu">
        <h1 className="visually-hidden">The Hidden Scion</h1>
        <Button primary autoFocus={!canContinue} onClick={newGame}>New Game</Button>
        <Button autoFocus={canContinue} disabled={!canContinue} onClick={() => store.load('auto')}
          title={auto?.status === 'ok' && !auto.compatible ? 'Saved under different rules' : undefined}>
          {auto?.status === 'ok' && !auto.compatible ? 'Continue (incompatible save)' : 'Continue'}
        </Button>
      </div>
      <span className="version">Playtest build · rules “{store.config.id}”</span>
    </Scene>
  );
}
