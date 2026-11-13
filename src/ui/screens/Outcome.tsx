import { BACKGROUND } from '../assets.js';
import { Button, Panel } from '../components/basic.js';
import { StatBlock } from '../components/meters.js';
import { Scene } from '../components/Stage.js';
import { ESTATES, fullName } from '../text/labels.js';
import { useGame } from '../useStore.js';

export function OutcomeScreen({ outcome }: { outcome: 'victory' | 'deadline' }) {
  const { store, snap } = useGame();
  const state = snap.state!;
  return (
    <Scene image={BACKGROUND.title}>
      <Panel variant="parchment" className="centre-panel"
        title={outcome === 'victory' ? 'The Scion is crowned' : 'The Conjunction has come'}>
        <p style={{ marginBottom: 12 }}>
          {outcome === 'victory'
            ? `${fullName(state)} reached the capital and claimed her birthright.`
            : `${fullName(state)}'s sixteenth birthday passed before she reached the capital.`}
        </p>
        <p className="muted">Weeks played: {state.elapsedWeeks} · Waystations reached: {state.furthestWaystation}</p>
        {ESTATES.map((e) => <StatBlock key={e} estate={e} value={state.stats[e]} />)}
        <div className="modal__actions"><Button primary autoFocus onClick={() => store.quitToTitle()}>Return to title</Button></div>
      </Panel>
    </Scene>
  );
}
