import type { SaveStorage } from './engine/persistence.js';

/** localStorage, or null when the browser blocks it. */
export function browserStorage(): SaveStorage | null {
  try {
    const s = window.localStorage;
    s.getItem('hidden-scion:probe');
    return s;
  } catch {
    return null;
  }
}
