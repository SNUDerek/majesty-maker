import { useCallback, useMemo } from 'react';
import { ResultPanel, Toast } from './components/overlays.js';
import { Stage } from './components/Stage.js';
import { CONFIG } from './config.js';
import { deriveScreen } from './engine/screen.js';
import { GameStore } from './engine/store.js';
import { ActivityScreen } from './screens/Activity.js';
import { Gallery } from './screens/Gallery.js';
import { HomeHub } from './screens/Home.js';
import { OutcomeScreen, PilgrimagePlaceholder } from './screens/Outcome.js';
import { TitleScreen } from './screens/Title.js';
import { browserStorage } from './storage.js';
import { StoreContext, useGame } from './useStore.js';

const params = new URLSearchParams(window.location.search);

function Game() {
  const { store, snap } = useGame();
  const screen = deriveScreen(snap.state, snap.ui);
  const clearError = useCallback(() => store.clearError(), [store]);
  let scene;
  switch (screen.kind) {
    case 'title': scene = <TitleScreen />; break;
    case 'outcome': scene = <OutcomeScreen outcome={screen.outcome} />; break;
    case 'encounter':
    case 'waystation': scene = <PilgrimagePlaceholder />; break;
    case 'home':
      scene = screen.view === 'tutor' || screen.view === 'job' || screen.view === 'rest'
        ? <ActivityScreen key={screen.view} kind={screen.view} />
        : <HomeHub convalescence={screen.convalescence} />;
      break;
  }
  return (
    <>
      {scene}
      {snap.ui.pendingResult !== undefined && <ResultPanel summary={snap.ui.pendingResult} onDismiss={() => store.dismissResult()} />}
      {snap.error !== null && <Toast message={snap.error} onClose={clearError} />}
    </>
  );
}

export function App() {
  const store = useMemo(() => new GameStore(CONFIG, browserStorage()), []);
  if (params.has('gallery')) return <Stage><Gallery config={CONFIG} /></Stage>;
  return (
    <StoreContext.Provider value={store}>
      <Stage><Game /></Stage>
    </StoreContext.Provider>
  );
}
