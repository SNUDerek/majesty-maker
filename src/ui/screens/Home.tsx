import { getDerivedStats } from '../../core/index.js';
import { BACKGROUND, IMAGES, ITEM_ICON } from '../assets.js';
import { Button, CoinAmount, Panel } from '../components/basic.js';
import { RouteStrip, TopBar } from '../components/chrome.js';
import { ConditionGauge, StatBlock } from '../components/meters.js';
import { Scene } from '../components/Stage.js';
import { activityOptions } from '../engine/activities.js';
import { thoughtLine } from '../engine/flavor.js';
import { departureBlocker } from '../engine/road.js';
import { ESTATES, SIGN_LABEL, criticalPeriodLabel, fullName } from '../text/labels.js';
import { useGame } from '../useStore.js';

export function SidePanel() {
  const { store, snap } = useGame();
  const state = snap.state!;
  const derived = getDerivedStats(state, store.config);
  const items = Object.entries(state.inventory).filter(([, n]) => n > 0);
  return (
    <Panel variant="parchment" className="home-side panel--tall">
      <h2>{fullName(state)}</h2>
      <span className="muted">Born under {SIGN_LABEL[state.birthSign]}</span>
      <h3 className="side-heading">Estates</h3>
      {ESTATES.map((e) => <StatBlock key={e} estate={e} value={state.stats[e]} />)}
      <h3 className="side-heading">Condition</h3>
      <ConditionGauge kind="fatigue" value={state.fatigue} ceiling={derived.fatigueCeiling} />
      <ConditionGauge kind="melancholy" value={state.melancholy} ceiling={derived.melancholyCeiling} />
      <span className="forecast">Purse Protection: <span className="num">{derived.purseProtectionPct}%</span></span>
      <span className="forecast">Treasury: <CoinAmount amount={state.treasury} /></span>
      {items.length > 0 && (
        <>
          <h3 className="side-heading">Inventory</h3>
          <div className="chips">
            {items.map(([id, n]) => (
              <span key={id} className="coin">
                {ITEM_ICON[id] !== undefined && <img src={ITEM_ICON[id]} width={24} height={24} alt="" />}
                {store.config.items.catalog[id]?.name ?? id} ×{n}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export function HomeHub({ convalescence }: { convalescence: boolean }) {
  const { store, snap } = useGame();
  const state = snap.state!;
  const derived = getDerivedStats(state, store.config);
  const blocker = departureBlocker(state, store.config);
  const thought = convalescence ? undefined : thoughtLine(state);
  const restHome = activityOptions(state, 'rest', store.config).find((o) => o.preview.activityId === 'rest_home')!;
  return (
    <Scene image={BACKGROUND.home}>
      <TopBar state={state} config={store.config} onMenu={() => store.setUi({ overlay: 'saveload' })}
        onChronicle={() => store.setUi({ overlay: 'chronicle' })} />
      <img className="home-princess" src={IMAGES.princessFull} alt={state.scionName} />
      {thought !== undefined && <p className="home-thought" aria-label={`${state.scionName}'s thoughts`}>{thought}</p>}
      <div className="home-centre">
        <Panel variant="parchment" title="How shall she spend this week?">
          {derived.nextCriticalSolarPeriod !== undefined && (
            <p className="forecast" style={{ marginBottom: 8 }}>
              {criticalPeriodLabel(derived.nextCriticalSolarPeriod, store.config)}
            </p>
          )}
          {convalescence ? (
            <>
              <p className="banner">She collapsed and must spend this week resting at home.</p>
              <div className="home-menu" style={{ marginTop: 12 }}>
                <Button primary autoFocus data-autofocus onClick={() => store.dispatch(restHome.action)}>Rest at home</Button>
              </div>
            </>
          ) : (
            <div className="home-menu">
              <Button data-autofocus onClick={() => store.setUi({ homeView: 'tutor' })}>Tutoring</Button>
              <Button onClick={() => store.setUi({ homeView: 'job' })}>Work</Button>
              <Button onClick={() => store.setUi({ homeView: 'rest' })}>Rest</Button>
              <Button disabled={blocker !== null} title={blocker ?? undefined} onClick={() => store.setUi({ homeView: 'prep' })}>
                Pilgrimage
              </Button>
              <Button disabled title="Social visits come later">Social (later)</Button>
            </div>
          )}
          {!convalescence && blocker !== null && <p className="home-note" style={{ marginTop: 8 }}>Pilgrimage: {blocker}.</p>}
        </Panel>
        <Panel title="The road to the capital">
          <RouteStrip furthest={state.furthestWaystation} total={store.config.route.regularSegments} />
        </Panel>
      </div>
      <SidePanel />
    </Scene>
  );
}
