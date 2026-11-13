import { useCallback, useMemo, useState } from 'react';
import { ResultPanel, Toast } from './components/overlays.js';
import { Stage } from './components/Stage.js';
import { CONFIG, CONFIG_LOADERS, type ConfigId } from './config.js';
import { deriveScreen } from './engine/screen.js';
import { GameStore } from './engine/store.js';
import { ActivityScreen } from './screens/Activity.js';
import { IntroScreen, SetupScreen, TitleScreen } from './screens/FrontDoor.js';
import { Gallery } from './screens/Gallery.js';
import { HomeHub } from './screens/Home.js';
import { CreditsOverlay, DevPanel, SaveLoadOverlay } from './screens/Menus.js';
import { OutcomeScreen } from './screens/Outcome.js';
import { EncounterScreen, PrepScreen, WaystationScreen } from './screens/Road.js';
import { browserStorage } from './storage.js';
import { StoreContext, useGame } from './useStore.js';

const params = new URLSearchParams(window.location.search);

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
  const { overlay, pendingResult } = snap.ui;
  return (
    <>
      {scene}
      {pendingResult !== undefined && overlay === undefined && <ResultPanel summary={pendingResult} onDismiss={() => store.dismissResult()} />}
      {overlay === 'saveload' && <SaveLoadOverlay />}
      {overlay === 'credits' && <CreditsOverlay />}
      {snap.error !== null && <Toast message={snap.error} onClose={clearError} />}
      {dev !== undefined && <DevPanel configId={dev.configId} onConfig={dev.onConfig} />}
    </>
  );
}

export function App() {
  const [configId, setConfigId] = useState<ConfigId>('default');
  const store = useMemo(
    () => new GameStore(configId === 'default' ? CONFIG : CONFIG_LOADERS[configId](), browserStorage()),
    [configId],
  );
  if (params.has('gallery')) return <Stage><Gallery config={CONFIG} /></Stage>;
  return (
    <StoreContext.Provider value={store}>
      <Stage><Game dev={params.has('dev') ? { configId, onConfig: setConfigId } : undefined} /></Stage>
    </StoreContext.Provider>
  );
}
