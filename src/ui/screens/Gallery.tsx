import { Story } from 'inkjs';
import { Dialog } from './Dialog.js';
import { useState } from 'react';
import { createCampaign, type RulesConfig } from '../../core/index.js';
import { BACKGROUND } from '../assets.js';
import { Button, CoinAmount, EstateIcon, Panel } from '../components/basic.js';
import { RouteStrip, TopBar, ZodiacGlyph } from '../components/chrome.js';
import { ConditionGauge, StatBlock } from '../components/meters.js';
import { Modal, ResultPanel, Toast } from '../components/overlays.js';
import { Scene } from '../components/Stage.js';
import type { ResultSummary } from '../engine/summarize.js';
import { ESTATES, SIGNS_IN_SHEET_ORDER } from '../text/labels.js';

const stories = import.meta.glob<string>('../../../content/story/*.ink', { eager: true, import: 'default' });
const scenes = Object.entries(stories).flatMap(([file, json]) => {
  const story = new Story(json);
  return [...story.mainContentContainer.namedContent.keys()]
    .filter(knot => story.TagsForContentAtPath(knot)?.some(tag => tag.startsWith('order:')))
    .map(knot => ({ id: `${file.split('/').pop()}/${knot}`, knot, json }));
});

const SAMPLE_RESULT: ResultSummary = {
  title: 'The Alehouse: failure — collapse!',
  detail: 'Rolled 72 against 50%.',
  tone: 'bad',
  rows: [
    { quantity: 'fatigue', label: 'Fatigue', amount: 5, sources: ['work'], parts: [{ source: 'work', amount: 5 }], tone: 'bad' },
    { quantity: 'melancholy', label: 'Melancholy', amount: 5, sources: ['work'], parts: [{ source: 'work', amount: 5 }], tone: 'bad' },
    { quantity: 'treasury', label: 'Treasury', amount: -20, sources: ['physician fee'], parts: [{ source: 'physician fee', amount: -20 }], tone: 'bad' },
  ],
  weeks: { count: 1, reasons: ['job'] },
  notes: ['She collapsed from Fatigue. Next week is spent recovering.'],
};

/** `?gallery`: every component on one screen, for eyeballing styles. */
export function Gallery({ config }: { config: RulesConfig }) {
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? '');
  const [playing, setPlaying] = useState(false);
  const selected = scenes.find(scene => scene.id === sceneId);
  const [overlay, setOverlay] = useState<'none' | 'modal' | 'result' | 'toast'>('none');
  const state = createCampaign(
    { seed: 1, birthSign: 'leo', playerName: { first: 'Aldous', last: 'Wyke' }, scionName: 'Elaine' }, config);
  return (
    <Scene image={BACKGROUND.home}>
      <TopBar state={state} config={config} onMenu={() => undefined} />
      <div style={{ position: 'absolute', top: 72, left: 16, right: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Panel variant="parchment" title="Estates">
          {ESTATES.map((e, i) => <StatBlock key={e} estate={e} value={[23, 55, 90][i]!} delta={[2, 0, -1][i]!} />)}
        </Panel>
        <Panel variant="parchment" title="Condition">
          <ConditionGauge kind="fatigue" value={34} ceiling={81} />
          <ConditionGauge kind="fatigue" value={34} ceiling={81} projected={70} />
          <ConditionGauge kind="melancholy" value={60} ceiling={70} projected={45} />
        </Panel>
        <Panel title="Plain panel">
          <p>Coin <CoinAmount amount={50} /> <CoinAmount amount={-20} sign /></p>
          <p>{ESTATES.map((e) => <EstateIcon key={e} estate={e} size={64} />)}</p>
          <RouteStrip furthest={2} total={config.route.regularSegments} />
        </Panel>
        <Panel title="Dialog preview">
          <label>Scene <select value={sceneId} onChange={event => setSceneId(event.target.value)}>
            {scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.id}</option>)}
          </select></label>
          <Button disabled={!selected} onClick={() => setPlaying(true)}>Play scene</Button>
        </Panel>
        <Panel variant="inset" title="Buttons">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button primary>Commit week</Button>
            <Button>Back</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Panel>
        <Panel variant="parchment" title="Overlays">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={() => setOverlay('modal')}>Modal</Button>
            <Button onClick={() => setOverlay('result')}>Result</Button>
            <Button onClick={() => setOverlay('toast')}>Toast</Button>
          </div>
        </Panel>
        <Panel variant="parchment" title="Zodiac">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SIGNS_IN_SHEET_ORDER.map((s) => <ZodiacGlyph key={s} sign={s} height={48} />)}
          </div>
        </Panel>
      </div>
      {playing && selected && <Dialog key={selected.id} json={selected.json} knot={selected.knot}
        inputs={{ scion: state.scionName, player: state.playerName.first, ...state.stats, fatigue: state.fatigue, melancholy: state.melancholy }} onFinish={() => setPlaying(false)} />}
      {overlay === 'modal' && (
        <Modal title="Depart?" actions={<><Button onClick={() => setOverlay('none')}>Back</Button><Button primary onClick={() => setOverlay('none')}>Depart</Button></>}>
          <p>Costs 1 week and a 10 Coin fee.</p>
        </Modal>
      )}
      {overlay === 'result' && <ResultPanel summary={SAMPLE_RESULT} onDismiss={() => setOverlay('none')} />}
      {overlay === 'toast' && <Toast message="That action is not available now." onClose={() => setOverlay('none')} />}
    </Scene>
  );
}
