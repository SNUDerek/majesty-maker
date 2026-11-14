import { useCallback, useMemo, useState } from 'react';
import { Dialog } from './screens/Dialog.js';
import { ResultPanel, Toast } from './components/overlays.js';
import { Stage } from './components/Stage.js';
import { CONFIG, CONFIG_LOADERS, type ConfigId } from './config.js';
import { deriveScreen } from './engine/screen.js';
import { GameStore } from './engine/store.js';
import { ActivityScreen } from './screens/Activity.js';
import { IntroScreen, SetupScreen, TitleScreen } from './screens/FrontDoor.js';
import { Gallery } from './screens/Gallery.js';
import { HomeHub } from './screens/Home.js';
import { ChronicleOverlay, CreditsOverlay, DevPanel, SaveLoadOverlay } from './screens/Menus.js';
import { OutcomeScreen } from './screens/Outcome.js';
import { EncounterScreen, PrepScreen, TutorialOverlay, WaystationScreen } from './screens/Road.js';
import { browserStorage } from './storage.js';
import { STORY } from './text/stories.js';
import type { SceneId } from './assets.js';
import { rewardLines, type BeatActivity } from './engine/story.js';
import type { RulesConfig } from '../core/index.js';
import { StoreContext, useGame } from './useStore.js';

const params = new URLSearchParams(window.location.search);

/** A beat's opening background when its knot has no `# bg:` tag: where the activity happens. */
function activityScene(activity: BeatActivity, config: RulesConfig): SceneId {
  if (Object.hasOwn(config.classes.tutors, activity)) return 'school';
  if (Object.hasOwn(config.jobs.definitions, activity)) return 'job';
  return 'home';
}

function StoryScene({ beatId, activity }: { beatId: string; activity: BeatActivity }) {
  const { store, snap } = useGame();
  const finish = useCallback(() => store.finishBeat(), [store]);
  const beat = store.beat(beatId);
  const state = snap.state;
  if (beat === undefined || state === null) return null;
  return (
    <Dialog key={beat.id} json={beat.json} knot={beat.knot} onFinish={finish}
      inputs={{ scion: state.scionName, player: state.playerName.first, ...state.stats }}
      background={(beat.bg as SceneId | undefined) ?? activityScene(activity, store.config)}
      left={beat.left ?? (activity === 'socialize' ? 'father' : 'scion')}
      rewards={rewardLines(beat, store.config)} />
  );
}

function Game({ dev }: { dev?: { configId: ConfigId; onConfig: (id: ConfigId) => void } }) {
  const { store, snap } = useGame();
  const screen = deriveScreen(snap.state, snap.ui);
  const clearError = useCallback(() => store.clearError(), [store]);
  let scene;
  switch (screen.kind) {
    case 'title': scene = <TitleScreen />; break;
    case 'intro': scene = <IntroScreen />; break;
    case 'setup': scene = <SetupScreen />; break;
    case 'outcome': scene = <OutcomeScreen outcome={screen.outcome} />; break;
    case 'encounter': scene = <EncounterScreen />; break;
    case 'waystation': scene = <WaystationScreen />; break;
    case 'home':
      scene = screen.view === 'tutor' || screen.view === 'job' || screen.view === 'rest'
        ? <ActivityScreen key={screen.view} kind={screen.view} />
        : screen.view === 'prep' ? <PrepScreen /> : <HomeHub convalescence={screen.convalescence} />;
      break;
  }
  const { overlay, pendingResult, pendingDialog } = snap.ui;
  return (
    <>
      {scene}
      {pendingDialog !== undefined && overlay === undefined && <StoryScene {...pendingDialog} />}
      {pendingResult !== undefined && pendingDialog === undefined && overlay === undefined && <ResultPanel summary={pendingResult} onDismiss={() => store.dismissResult()} />}
      {overlay === 'saveload' && <SaveLoadOverlay />}
      {overlay === 'credits' && <CreditsOverlay />}
      {overlay === 'chronicle' && <ChronicleOverlay />}
      {overlay === 'tutorial' && <TutorialOverlay />}
      {snap.error !== null && <Toast message={snap.error} onClose={clearError} />}
      {dev !== undefined && <DevPanel configId={dev.configId} onConfig={dev.onConfig} />}
    </>
  );
}

export function App() {
  const [configId, setConfigId] = useState<ConfigId>('default');
  const store = useMemo(
    () => new GameStore(configId === 'default' ? CONFIG : CONFIG_LOADERS[configId](), browserStorage(), undefined, STORY.beats),
    [configId],
  );
  if (params.has('gallery')) return <Stage><Gallery config={CONFIG} /></Stage>;
  return (
    <StoreContext.Provider value={store}>
      <Stage><Game dev={params.has('dev') ? { configId, onConfig: setConfigId } : undefined} /></Stage>
    </StoreContext.Provider>
  );
}
