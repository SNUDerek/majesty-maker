import { readFileSync } from 'node:fs';
import { loadConfig, type RulesConfig } from '../../core/config.js';

const contentDirectory = new URL('../../../content/', import.meta.url);

/** Parses a JSON file under content/ (e.g. 'rules.default.json', 'variants/x.json'). */
export function readContentJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, contentDirectory), 'utf8'));
}

/** Loads rules.default.json + items.json, with optional variant files from content/ on top. */
export function loadContentConfig(...variantPaths: string[]): RulesConfig {
  return loadConfig({
    rules: readContentJson('rules.default.json'),
    items: readContentJson('items.json'),
    variants: variantPaths.map(readContentJson),
  });
}
