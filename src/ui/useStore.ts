import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameSnapshot, GameStore } from './engine/store.js';

export const StoreContext = createContext<GameStore | null>(null);

export function useGame(): { store: GameStore; snap: GameSnapshot } {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useGame outside StoreContext');
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, snap };
}
