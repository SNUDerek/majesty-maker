import { readFileSync } from 'node:fs';
import { loadConfig, type RulesConfig } from '../../core/config.js';

const contentDirectory = new URL('../../../content/', import.meta.url);

/** Parses a JSON file under content/ (e.g. 'rules.legacy.json', 'variants/x.json'). */
export function readContentJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, contentDirectory), 'utf8'));
}

/** Loads rules.legacy.json + items.json, with optional variant files from content/ on top. */
export function loadContentConfig(...variantPaths: string[]): RulesConfig {
  return loadConfig({
    rules: readContentJson('rules.legacy.json'),
    items: readContentJson('items.json'),
    variants: variantPaths.map(readContentJson),
  });
}

/** Loads the shipped POC defaults, for CLI and current-default regression tests. */
export function loadShippedConfig(...variantPaths: string[]): RulesConfig {
  return loadConfig({ rules: readContentJson('rules.default.json'), items: readContentJson('items.json'),
    variants: variantPaths.map(readContentJson) });
}
