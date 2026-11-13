import { useEffect, useState } from 'react';
import { getDerivedStats, type CampaignState, type RulesConfig } from '../../core/index.js';
import { ACTIVITY_PORTRAIT, BACKGROUND } from '../assets.js';
import { Button, CoinAmount, EstateIcon, Panel } from '../components/basic.js';
import { TopBar } from '../components/chrome.js';
import { ConditionGauge } from '../components/meters.js';
import { Scene } from '../components/Stage.js';
import { activityOptions, outcomeLines, type ActivityKind, type ActivityOption } from '../engine/activities.js';
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
      <span className="card__row">
        <span>{preview.chance === null ? (preview.kind === 'job' ? 'Automatic' : '') : `${preview.chance}% success`}</span>
        {preview.cost > 0 && <CoinAmount amount={-preview.cost} sign />}
      </span>
      <span className="muted">{outcomeLines(preview.success).join(' · ')}</span>
      {option.reason !== undefined && <span className="card__reason">{option.reason}</span>}
    </button>
  );
}

function PreviewPanel({ option, state, config, onCommit, onBack }: {
  option: ActivityOption; state: CampaignState; config: RulesConfig; onCommit: () => void; onBack: () => void;
}) {
  const { preview } = option;
  const derived = getDerivedStats(state, config);
  const worst = preview.failure !== undefined
    ? { fatigue: Math.max(preview.success.fatigue, preview.failure.fatigue), melancholy: Math.max(preview.success.melancholy, preview.failure.melancholy) }
    : preview.success;
  const collapse = preview.success.collapse ?? preview.failure?.collapse ?? null;
  return (
    <Panel variant="parchment" className="preview">
      <h2>{ACTIVITY_LABEL[preview.activityId]}</h2>
      <p className="muted">{ACTIVITY_BLURB[preview.activityId]}</p>
      {preview.cost > 0 && (
        <p>Fee <CoinAmount amount={preview.cost} />{!preview.affordable && <span className="warn"> — treasury only {state.treasury}</span>}</p>
      )}
      {preview.kind === 'job' && (
        <p><span className="preview__chance num">{preview.chance === null ? 'Automatic' : `${preview.chance}%`}</span>
          {preview.chance !== null && <span className="muted"> chance of success</span>}</p>
      )}
      <div className="preview__cols">
        <div>
          <h3>{preview.failure === undefined ? 'Outcome' : 'On success'}</h3>
          <ul>{outcomeLines(preview.success).map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        {preview.failure !== undefined && (
          <div>
            <h3>On failure</h3>
            <ul>{outcomeLines(preview.failure).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )}
      </div>
      <ConditionGauge kind="fatigue" value={state.fatigue} ceiling={derived.fatigueCeiling}
        projected={Math.max(0, state.fatigue + worst.fatigue)} />
      <ConditionGauge kind="melancholy" value={state.melancholy} ceiling={derived.melancholyCeiling}
        projected={Math.max(0, state.melancholy + worst.melancholy)} />
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
      <TopBar state={state} config={store.config} onMenu={() => store.quitToTitle()} />
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
