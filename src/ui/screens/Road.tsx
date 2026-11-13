import { useEffect, useState } from 'react';
import {
  getAvailableActions,
  getDerivedStats,
  previewApproaches,
  type CampaignState,
  type GameAction,
  type RulesConfig,
} from '../../core/index.js';
import { BACKGROUND, ITEM_ICON } from '../assets.js';
import { Button, CoinAmount, EstateIcon, Panel } from '../components/basic.js';
import { RouteStrip, TopBar } from '../components/chrome.js';
import { ConditionGauge } from '../components/meters.js';
import { Modal, ResultRows } from '../components/overlays.js';
import { EstateName } from '../components/stats.js';
import { Scene } from '../components/Stage.js';
import {
  carryPresets, departureAction, departureOption, previewLeave, segmentInfo, segmentMoon,
} from '../engine/road.js';
import { markTutorialSeen, pilgrimageTutorial, tutorialSeen } from '../engine/tutorial.js';
import { browserStorage } from '../storage.js';
import {
  signed, ESTATES, ESTATE_LABEL, LUNAR_LABEL, MATCHUP_LABEL, THREAT_FLAVOUR, itemEffectLabel, threatLabel, penaltyLabel, roadMoonLabel,
} from '../text/labels.js';
import { useGame } from '../useStore.js';

type UseConsumable = Extract<GameAction, { type: 'USE_CONSUMABLE' }>;

function itemName(id: string, config: RulesConfig): string {
  return config.items.catalog[id]?.name ?? id;
}

function ItemLabel({ id, config }: { id: string; config: RulesConfig }) {
  const item = config.items.catalog[id];
  return (
    <span className="item-line">
      {ITEM_ICON[id] !== undefined && <img src={ITEM_ICON[id]} width={24} height={24} alt="" />}
      <span>{itemName(id, config)}{item !== undefined && <span className="muted"> — {itemEffectLabel(item)}</span>}</span>
    </span>
  );
}

/** The usable consumable at this stage, if any (from getAvailableActions). */
function consumableAction(state: CampaignState, config: RulesConfig): UseConsumable | undefined {
  return getAvailableActions(state, config).find((a): a is UseConsumable => a.type === 'USE_CONSUMABLE');
}

function ConsumableButton({ action, config, onUse }: { action: UseConsumable; config: RulesConfig; onUse: () => void }) {
  const item = config.items.catalog[action.itemId];
  return (
    <Button onClick={onUse} title={item === undefined ? undefined : itemEffectLabel(item)}>
      Use {itemName(action.itemId, config)}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

export function PilgrimageHud({ state, config, onMenu, onChronicle, onHelp }: {
  state: CampaignState; config: RulesConfig; onMenu: () => void; onChronicle: () => void; onHelp: () => void;
}) {
  const road = state.pilgrimage!;
  const info = segmentInfo(road.segmentIndex, config);
  const derived = getDerivedStats(state, config);
  const moon = segmentMoon(state, config);
  return (
    <header className="hud">
      <div className="hud__segment">
        <span className="hud__name">{info.name}</span>
        <span className="pips" aria-label={`Encounter ${Math.min(road.encounterIndex + 1, info.length)} of ${info.length}`}>
          {Array.from({ length: info.length }, (_, i) => (
            <span key={i} className={`pip ${i < road.encounterIndex ? 'pip--done' : i === road.encounterIndex ? 'pip--now' : ''}`} />
          ))}
        </span>
      </div>
      <div className="hud__stats">
        <span title={roadMoonLabel(moon, config)}>Moon at departure: {LUNAR_LABEL[moon]}</span>
        <span title="Carried Coin">Carried <CoinAmount amount={road.carriedCoin} /></span>
        <span className="dim" title="Treasury at home">Home <CoinAmount amount={state.treasury} /></span>
      </div>
      <div className="hud__stats">
        {ESTATES.map((e) => <span key={e} title={ESTATE_LABEL[e]}><EstateIcon estate={e} size={24} /> <span className="num">{state.stats[e]}</span></span>)}
      </div>
      <div className="hud__gauges">
        <ConditionGauge kind="fatigue" value={state.fatigue} ceiling={derived.fatigueCeiling} />
        <ConditionGauge kind="melancholy" value={state.melancholy} ceiling={derived.melancholyCeiling} />
      </div>
      <div className="hud__buttons">
        <HelpButton onClick={onHelp} />
        <Button onClick={onChronicle}>Chronicle</Button>
        <Button onClick={onMenu}>Menu</Button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

function HelpButton({ onClick }: { onClick: () => void }) {
  return <Button className="btn--help" onClick={onClick} aria-label="How the pilgrimage works" title="How the pilgrimage works">?</Button>;
}

/** The four-page pilgrimage guide on the unframed parchment (plan §6 T1). */
export function TutorialOverlay() {
  const { store } = useGame();
  const pages = pilgrimageTutorial(store.config);
  const [index, setIndex] = useState(0);
  const page = pages[index]!;
  const last = index === pages.length - 1;
  const close = () => store.closeOverlay();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(pages.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <Modal sheet className="tutorial" title={
      <div className="tutorial__head">
        <h2>{page.title}</h2>
        <span className="muted" aria-label={`Page ${index + 1} of ${pages.length}`}>{index + 1} / {pages.length}</span>
      </div>
    } actions={<>
      <Button className="tutorial__close" onClick={close}>Close</Button>
      <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</Button>
      <Button primary onClick={() => (last ? close() : setIndex(index + 1))}>{last ? 'Done' : 'Next'}</Button>
    </>}>
      <div className="tutorial__body" aria-live="polite">
        {page.beats !== undefined && (
          <ul className="tutorial__beats">
            {page.beats.map(({ winner, loser }) => (
              <li key={winner}>
                <EstateIcon estate={winner} size={32} /> <EstateName estate={winner} />
                <span className="muted"> beat </span>
                <EstateIcon estate={loser} size={32} /> <EstateName estate={loser} />
              </li>
            ))}
          </ul>
        )}
        {page.paragraphs.map((p) => <p key={p}>{p}</p>)}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

export function PrepScreen() {
  const { store, snap } = useGame();
  const state = snap.state!;
  const { config } = store;
  const option = departureOption(state, config);
  const [carry, setCarry] = useState(() => (option === null ? 0 : Math.floor(option.maxCarry / 2)));
  const [equipmentId, setEquipment] = useState<string>('');
  const [consumableId, setConsumable] = useState<string>('');
  const back = () => store.setUi({ homeView: 'hub' });
  const help = () => store.setUi({ overlay: 'tutorial' });
  // The guide opens by itself on the first visit in this browser (plan §6 T2).
  useEffect(() => {
    const storage = browserStorage();
    if (tutorialSeen(storage)) return;
    markTutorialSeen(storage);
    help();
  }, []);
  const overlayOpen = snap.ui.overlay !== undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !overlayOpen) back(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const info = segmentInfo(state.furthestWaystation, config);
  const derived = getDerivedStats(state, config);
  const action = option === null ? null
    : departureAction(option, carry, equipmentId || undefined, consumableId || undefined);
  return (
    <Scene image={BACKGROUND.pilgrimage}>
      <TopBar state={state} config={config} onMenu={() => store.setUi({ overlay: 'saveload' })}
        onChronicle={() => store.setUi({ overlay: 'chronicle' })} />
      <div className="prep">
        <Panel variant="parchment" className="panel--wide" title="The pilgrimage">
          <RouteStrip furthest={state.furthestWaystation} total={config.route.regularSegments} />
          <h2 style={{ marginTop: 16 }}>{info.name}</h2>
          <p>{info.length} encounters · road bonus {signed(info.roadBonus)}%</p>
          <p style={{ marginTop: 8 }}>Moon this week: {roadMoonLabel(derived.lunarPhase, config)}.</p>
        </Panel>
        <Panel variant="parchment" title="Provisions">
          {option === null || action === null ? <p>She cannot depart now.</p> : (
            <>
              <p>Departure fee <CoinAmount amount={option.fee} /> · treasury <CoinAmount amount={state.treasury} /></p>
              <label className="field">
                <span>Coin to carry (spent on bribes and lost on Laboratores failures; banked on return)</span>
                <span className="carry">
                  <input type="range" min={option.minCarry} max={option.maxCarry} value={action.carry}
                    onChange={(e) => setCarry(Number(e.target.value))} aria-label="Carry" />
                  <input type="number" min={option.minCarry} max={option.maxCarry} value={action.carry}
                    onChange={(e) => setCarry(Number(e.target.value))} aria-label="Carry amount" />
                </span>
              </label>
              <div className="presets" style={{ marginTop: 6 }}>
                {carryPresets(option).map((p) => <Button key={p.label} onClick={() => setCarry(p.carry)}>{p.label}</Button>)}
              </div>
              <p style={{ marginTop: 6 }}>Treasury after departure: <CoinAmount amount={state.treasury - option.fee - action.carry} /></p>
              {option.equipmentIds.length > 0 && (
                <label className="field"><span>Equipment</span>
                  <select value={equipmentId} onChange={(e) => setEquipment(e.target.value)}>
                    <option value="">None</option>
                    {option.equipmentIds.map((id) => <option key={id} value={id}>{itemName(id, config)}</option>)}
                  </select>
                  {equipmentId !== '' && <ItemLabel id={equipmentId} config={config} />}
                </label>
              )}
              {option.consumableIds.length > 0 && (
                <label className="field"><span>Consumable</span>
                  <select value={consumableId} onChange={(e) => setConsumable(e.target.value)}>
                    <option value="">None</option>
                    {option.consumableIds.map((id) => <option key={id} value={id}>{itemName(id, config)}</option>)}
                  </select>
                  {consumableId !== '' && <ItemLabel id={consumableId} config={config} />}
                </label>
              )}
              <div className="prep-gauges">
                <ConditionGauge kind="fatigue" value={state.fatigue} ceiling={derived.fatigueCeiling} />
                <ConditionGauge kind="melancholy" value={state.melancholy} ceiling={derived.melancholyCeiling} />
              </div>
              <div>
                <p className="forecast">Purse Protection: {derived.purseProtectionPct}% of carried Coin survives a wipeout</p>
              </div>
              <p className="summary-line">
                Costs 1 week and the {option.fee} Coin fee. On a wipeout she loses the carried Coin above Purse Protection.
              </p>
            </>
          )}
          <div className="preview__actions" style={{ marginTop: 12 }}>
            <HelpButton onClick={help} />
            <Button onClick={back}>Back</Button>
            <Button primary disabled={action === null} onClick={() => action !== null && store.dispatch(action)}>
              {info.isFinal ? 'Begin the Final Gauntlet' : 'Depart'}
            </Button>
          </div>
        </Panel>
      </div>
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Encounter
// ---------------------------------------------------------------------------

function ThreatCard({ state }: { state: CampaignState }) {
  const road = state.pilgrimage!;
  const threat = road.currentThreat;
  if (road.stage === 'continue_or_retreat' || threat === undefined) {
    return (
      <div className="threat">
        <h2>The road ahead</h2>
        <p>Encounter {road.encounterIndex} cleared. What waits beyond the next bend is unknown.</p>
      </div>
    );
  }
  const lines = THREAT_FLAVOUR[threat];
  return (
    <div className={`threat threat--${threat}`}>
      <EstateIcon estate={threat} size={96} />
      <h2>{threatLabel(threat)}</h2>
      <p>{lines[(road.segmentIndex + road.encounterIndex) % lines.length]}</p>
    </div>
  );
}

function ChooseApproach({ state, config, onAct }: { state: CampaignState; config: RulesConfig; onAct: (a: GameAction) => void }) {
  const approaches = previewApproaches(state, config);
  const canSkip = getAvailableActions(state, config).some((a) => a.type === 'SKIP_ENCOUNTER');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey
        || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]'))) return;
      const estate = ESTATES[Number(e.key) - 1];
      if (estate !== undefined && !e.repeat) onAct({ type: 'CHOOSE_APPROACH', estate });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <Panel variant="parchment" title="How will she meet it?">
      <div className="approaches">
        {approaches.map((a, i) => (
          <button key={a.estate} type="button" className="approach" onClick={() => onAct({ type: 'CHOOSE_APPROACH', estate: a.estate })}>
            <span className="approach__icon"><EstateIcon estate={a.estate} /></span>
            <span className="approach__name"><span className="key">{i + 1}</span><EstateName estate={a.estate} /></span>
            <span className="approach__odds num">{a.odds.probability}%</span>
            <span className="approach__meta">
              {MATCHUP_LABEL[a.odds.matchup]} · win: +{a.reward.min}–{a.reward.max} Coin · fail:{' '}
              <span className={a.failure.resource === 'coin' ? '' : 'st st--cost'}>{penaltyLabel(a.failure)}</span>
              {a.failureWipesOut && <span className="warn"> · failure means wipeout</span>}
            </span>
          </button>
        ))}
      </div>
      {canSkip && (
        <div className="road-actions">
          <Button onClick={() => onAct({ type: 'SKIP_ENCOUNTER' })}>
            Bribe past ({config.astrology.newMoon.skipFee} carried Coin, New Moon)
          </Button>
        </div>
      )}
    </Panel>
  );
}

function RerollOrAccept({ state, config, onAct }: { state: CampaignState; config: RulesConfig; onAct: (a: GameAction) => void }) {
  const road = state.pilgrimage!;
  const [current] = previewApproaches(state, config);
  const reroll = consumableAction(state, config);
  return (
    <Panel variant="parchment" title="A failed roll">
      <p className="big-roll num">Rolled {road.lastRoll} against {road.lastProbability}%</p>
      <p>The failure is not yet charged: {current === undefined ? '' : penaltyLabel(current.failure)}
        {current?.failureWipesOut && <span className="warn"> — this would be a wipeout</span>}.</p>
      <div className="road-actions">
        {reroll !== undefined && (
          <Button onClick={() => onAct(reroll)}>Drink {itemName(reroll.itemId, config)} (reroll)</Button>
        )}
        <Button primary onClick={() => onAct({ type: 'ACCEPT_RESULT' })}>
          Accept failure{current === undefined ? '' : ` (${penaltyLabel(current.failure)})`}
        </Button>
      </div>
    </Panel>
  );
}

function ContinueOrRetreat({ state, config, onAct, onRetreat }: {
  state: CampaignState; config: RulesConfig; onAct: (a: GameAction) => void; onRetreat: () => void;
}) {
  const consumable = consumableAction(state, config);
  const road = state.pilgrimage!;
  const info = segmentInfo(road.segmentIndex, config);
  const left = info.length - road.encounterIndex;
  return (
    <Panel variant="parchment" title="Press on, or turn back?">
      <p>{left} encounter{left === 1 ? '' : 's'} left before {info.isFinal ? 'the capital' : `Waystation ${road.segmentIndex + 1}`}.</p>
      <p className="muted">Earned this run: <CoinAmount amount={road.earnedCoin} />. Retreating keeps the Coin carried from home and part of the loot, and costs a toll.</p>
      <div className="road-actions">
        {consumable !== undefined && <ConsumableButton action={consumable} config={config} onUse={() => onAct(consumable)} />}
        <Button onClick={onRetreat}>Retreat home</Button>
        <Button primary autoFocus data-autofocus onClick={() => onAct({ type: 'CONTINUE_ENCOUNTER' })}>Press on</Button>
      </div>
    </Panel>
  );
}

/** Confirm modal with the dry-run retreat (RETREAT draws no RNG). */
function RetreatConfirm({ state, config, onCancel, onConfirm }: {
  state: CampaignState; config: RulesConfig; onCancel: () => void; onConfirm: () => void;
}) {
  const retreat = previewLeave(state, { type: 'RETREAT' }, config);
  return (
    <Modal title="Retreat home?" actions={<>
      <Button onClick={onCancel}>Stay</Button>
      <Button primary onClick={onConfirm}>Retreat</Button>
    </>}>
      <ResultRows rows={retreat.rows} />
      {retreat.notes.map((n) => <p key={n} className="warn">{n}</p>)}
      <p className="muted" style={{ marginTop: 8 }}>No time passes. Waystations already secured are kept.</p>
    </Modal>
  );
}

export function EncounterScreen() {
  const { store, snap } = useGame();
  const state = snap.state!;
  const road = state.pilgrimage!;
  const act = (a: GameAction) => store.dispatch(a);
  // Hide stage actions (and their 1/2/3 keys) while a result or menu overlay is up.
  const blocked = snap.ui.pendingResult !== undefined || snap.ui.overlay !== undefined;
  const [confirming, setConfirming] = useState(false);
  return (
    <Scene image={road.isFinal ? BACKGROUND.capital : BACKGROUND.pilgrimage}>
      <PilgrimageHud state={state} config={store.config} onMenu={() => store.setUi({ overlay: 'saveload' })}
        onChronicle={() => store.setUi({ overlay: 'chronicle' })} onHelp={() => store.setUi({ overlay: 'tutorial' })} />
      <div className="road">
        <ThreatCard state={state} />
        {!blocked && road.stage === 'choose_approach' && <ChooseApproach state={state} config={store.config} onAct={act} />}
        {!blocked && road.stage === 'reroll_or_accept' && <RerollOrAccept state={state} config={store.config} onAct={act} />}
        {!blocked && road.stage === 'continue_or_retreat' && (
          <ContinueOrRetreat state={state} config={store.config} onAct={act} onRetreat={() => setConfirming(true)} />
        )}
      </div>
      {confirming && road.stage === 'continue_or_retreat' && (
        <RetreatConfirm state={state} config={store.config} onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); act({ type: 'RETREAT' }); }} />
      )}
    </Scene>
  );
}

// ---------------------------------------------------------------------------
// Waystation
// ---------------------------------------------------------------------------

export function WaystationScreen() {
  const { store, snap } = useGame();
  const state = snap.state!;
  const { config } = store;
  const road = state.pilgrimage!;
  const available = getAvailableActions(state, config);
  const canContinue = available.some((a) => a.type === 'CONTINUE_SEGMENT');
  const consumable = consumableAction(state, config);
  const next = segmentInfo(road.segmentIndex + 1, config);
  const derived = getDerivedStats(state, config);
  return (
    <Scene image={BACKGROUND.waystation}>
      <PilgrimageHud state={state} config={config} onMenu={() => store.setUi({ overlay: 'saveload' })}
        onChronicle={() => store.setUi({ overlay: 'chronicle' })} onHelp={() => store.setUi({ overlay: 'tutorial' })} />
      <Panel variant="parchment" className="centre-panel" title={`Waystation ${road.segmentIndex + 1} secured`}>
        <RouteStrip furthest={state.furthestWaystation} total={config.route.regularSegments} />
        <p style={{ marginTop: 10 }}>Carried <CoinAmount amount={road.carriedCoin} /> · earned this run <CoinAmount amount={road.earnedCoin} /></p>
        <p className="muted">Next: {next.name}, {next.length} encounters, road bonus {signed(next.roadBonus)}%.
          The moon will be fixed at {LUNAR_LABEL[derived.lunarPhase]} if she sets out now: {roadMoonLabel(derived.lunarPhase, config)}.</p>
        <ConditionGauge kind="fatigue" value={state.fatigue} ceiling={derived.fatigueCeiling} />
        <ConditionGauge kind="melancholy" value={state.melancholy} ceiling={derived.melancholyCeiling} />
        {snap.ui.pendingResult === undefined && snap.ui.overlay === undefined && (
          <div className="road-actions">
            {consumable !== undefined && <ConsumableButton action={consumable} config={config} onUse={() => store.dispatch(consumable)} />}
            <Button onClick={() => store.dispatch({ type: 'RETURN_HOME' })}>Return home (bank {road.carriedCoin} Coin)</Button>
            {canContinue && (
              <Button primary autoFocus data-autofocus onClick={() => store.dispatch({ type: 'CONTINUE_SEGMENT' })}>
                {next.isFinal ? 'Begin the Final Gauntlet (1 week)' : `Continue to Waystation ${road.segmentIndex + 2} (1 week, no fee)`}
              </Button>
            )}
          </div>
        )}
      </Panel>
    </Scene>
  );
}
