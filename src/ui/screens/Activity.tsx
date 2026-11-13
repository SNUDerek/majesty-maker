import { useEffect, useState } from 'react';
import type { ActivityOutcome, CampaignState, RulesConfig } from '../../core/index.js';
import { ACTIVITY_PORTRAIT, BACKGROUND } from '../assets.js';
import { Button, EstateIcon, Panel } from '../components/basic.js';
import { StatLine, StatText } from '../components/stats.js';
import { TopBar } from '../components/chrome.js';
import { ConditionGauge } from '../components/meters.js';
import { Scene } from '../components/Stage.js';
import { activityOptions, outcomeParts, partText, projectedConditions, type ActivityKind, type ActivityOption } from '../engine/activities.js';
import { ACTIVITY_BLURB, ACTIVITY_LABEL, modifierLabel } from '../text/labels.js';
import { useGame } from '../useStore.js';

const KIND: Record<ActivityKind, { title: string; scene: 'school' | 'job' | 'home'; scrim: boolean }> = {
  tutor: { title: 'Tutoring', scene: 'school', scrim: false },
  job: { title: 'Work', scene: 'job', scrim: false },
  rest: { title: 'Rest', scene: 'home', scrim: true },
};

/** The Estate an activity trains or uses, for the card icon. */
function activityEstate(option: ActivityOption, config: RulesConfig) {
  const { action } = option;
  if (action.type === 'TRAIN') return config.classes.tutors[action.tutor].target;
  if (action.type === 'WORK') return config.jobs.definitions[action.job].success.gainStat;
  return undefined;
}

function Card({ option, selected, onSelect, config }: {
  option: ActivityOption; selected: boolean; onSelect: () => void; config: RulesConfig;
}) {
  const { preview } = option;
  const art = ACTIVITY_PORTRAIT[preview.activityId];
  const estate = activityEstate(option, config);
  const parts = outcomeParts(preview.success);
  return (
    <button
      type="button"
      className={`card ${option.enabled ? '' : 'card--disabled'}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {preview.kind === 'tutor' && art !== undefined && <img className="card__art" src={art} alt="" />}
      <span className="card__row">
        <span className="card__name">{ACTIVITY_LABEL[preview.activityId]}</span>
        {estate !== undefined && <EstateIcon estate={estate} />}
      </span>
      <StatLine parts={parts.filter((p) => p.kind === 'estate')} />
      <StatLine parts={parts.filter((p) => p.kind === 'condition')} />
      <span className="card__row">
        <StatLine parts={parts.filter((p) => p.kind === 'coin')} />
        {preview.kind === 'job' && <span>{preview.chance === null ? 'Automatic' : `${preview.chance}% success`}</span>}
      </span>
      {option.reason !== undefined && <span className="card__reason">{option.reason}</span>}
    </button>
  );
}

function OutcomeList({ outcome }: { outcome: ActivityOutcome }) {
  const parts = outcomeParts(outcome);
  if (parts.length === 0) return <ul><li>No change</li></ul>;
  return <ul>{parts.map((p) => <li key={partText(p)}><StatText part={p} /></li>)}</ul>;
}

function PreviewPanel({ option, state, config, onCommit, onBack }: {
  option: ActivityOption; state: CampaignState; config: RulesConfig; onCommit: () => void; onBack: () => void;
}) {
  const { preview } = option;
  const projected = projectedConditions(state, preview, config);
  const collapse = preview.success.collapse ?? preview.failure?.collapse ?? null;
  return (
    <Panel variant="parchment" className="preview panel--tall">
      <h2>{ACTIVITY_LABEL[preview.activityId]}</h2>
      <p className="muted">{ACTIVITY_BLURB[preview.activityId]}</p>
      {!preview.affordable && <p className="warn">Costs {preview.cost}; the treasury holds only {state.treasury}.</p>}
      {preview.kind === 'job' && (
        <p><span className="preview__chance num">{preview.chance === null ? 'Automatic' : `${preview.chance}%`}</span>
          {preview.chance !== null && <span className="muted"> chance of success</span>}</p>
      )}
      <div className="preview__cols">
        <div>
          <h3>{preview.failure === undefined ? 'Outcome' : 'On success'}</h3>
          <OutcomeList outcome={preview.success} />
        </div>
        {preview.failure !== undefined && (
          <div>
            <h3>On failure</h3>
            <OutcomeList outcome={preview.failure} />
          </div>
        )}
      </div>
      <ConditionGauge kind="fatigue" value={state.fatigue} ceiling={projected.fatigue.ceiling}
        projected={projected.fatigue.value} />
      <ConditionGauge kind="melancholy" value={state.melancholy} ceiling={projected.melancholy.ceiling}
        projected={projected.melancholy.value} />
      {collapse !== null && (
        <p className="warn">
          {preview.success.collapse !== null ? 'This will make her collapse.' : 'If this fails, she will collapse.'}
        </p>
      )}
      {preview.modifiers.length > 0 && (
        <div className="chips">{preview.modifiers.map((m) => <span key={m} className="chip">{modifierLabel(m, config, preview.activityId)}</span>)}</div>
      )}
      <div className="preview__actions">
        <Button onClick={onBack}>Back</Button>
        <Button primary disabled={!option.enabled} title={option.reason} onClick={onCommit}>Commit week</Button>
      </div>
    </Panel>
  );
}

export function ActivityScreen({ kind }: { kind: ActivityKind }) {
  const { store, snap } = useGame();
  const state = snap.state!;
  const options = activityOptions(state, kind, store.config);
  const [selected, setSelected] = useState(() => Math.max(0, options.findIndex((o) => o.enabled)));
  const option = options[selected] ?? options[0]!;
  const back = () => store.setUi({ homeView: 'hub' });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const { title, scene, scrim } = KIND[kind];
  return (
    <Scene image={BACKGROUND[scene]} scrim={scrim}>
      <TopBar state={state} config={store.config} onMenu={() => store.setUi({ overlay: 'saveload' })}
        onChronicle={() => store.setUi({ overlay: 'chronicle' })} />
      <div className="activity">
        <div className={`activity__cards activity__cards--${kind}`}>
          <h1 className="activity__header">{title}</h1>
          {options.map((o, i) => (
            <Card key={o.preview.activityId} option={o} selected={i === selected} onSelect={() => setSelected(i)} config={store.config} />
          ))}
        </div>
        <PreviewPanel option={option} state={state} config={store.config}
          onCommit={() => store.dispatch(option.action)} onBack={back} />
      </div>
    </Scene>
  );
}
