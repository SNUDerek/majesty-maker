/** Rules configs, imported by Vite at build time. The dev panel can switch between them. */
import { loadConfig, type RulesConfig } from '../core/index.js';
import items from '../../content/items.json';
import experimental from '../../content/rules.experimental.json';
import legacy from '../../content/rules.legacy.json';
import rules from '../../content/rules.default.json';

/** Every item ×3 at the start, so the dev panel can exercise item slots, remedies and Metheglin. */
const ALL_ITEMS = {
  id: 'default+items',
  startingState: {
    startingInventory: { theriac: 3, st_johns_wort: 3, metheglin: 3, gambeson: 3, saints_relic: 3, weighted_coin: 3 },
  },
};

export type ConfigId = 'default' | 'default+items' | 'experimental' | 'legacy';

export const CONFIG_LOADERS: Record<ConfigId, () => RulesConfig> = {
  default: () => loadConfig({ rules, items }),
  'default+items': () => loadConfig({ rules, items, variants: [ALL_ITEMS] }),
  experimental: () => loadConfig({ rules: experimental, items }),
  legacy: () => loadConfig({ rules: legacy, items }),
};

export const CONFIG: RulesConfig = CONFIG_LOADERS.default();
