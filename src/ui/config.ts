/** The shipped rules, imported by Vite at build time. */
import { loadConfig, type RulesConfig } from '../core/index.js';
import items from '../../content/items.json';
import rules from '../../content/rules.default.json';

export const CONFIG: RulesConfig = loadConfig({ rules, items });
