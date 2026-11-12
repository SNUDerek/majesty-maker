import { readdir, readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const coreDirectory = new URL('../core/', import.meta.url);

const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

const importPrefix = String.raw`(?:from\s*|import\s*\(\s*|import\s*|require\s*\(\s*)`;
const quote = "['\"`]";

function importOf(moduleSource: string): RegExp {
  return new RegExp(`${importPrefix}${quote}${moduleSource}${quote}`, 'u');
}

const forbiddenPatterns: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  { label: 'React', pattern: importOf("react(?:/[^'\"`]*)?") },
  { label: 'Zustand', pattern: importOf("zustand(?:/[^'\"`]*)?") },
  { label: 'Node built-in', pattern: importOf("node:[^'\"`]+") },
  { label: 'fs', pattern: importOf("fs(?:/[^'\"`]*)?") },
  { label: 'path', pattern: importOf("path(?:/[^'\"`]*)?") },
  { label: 'process', pattern: /(?<![\w$.])process\s*(?:\.|\[|\?\.)|\bglobalThis\s*\.\s*process\b/u },
  { label: 'Math.random', pattern: /\bMath\.random\b/u },
  { label: 'Date.now', pattern: /\bDate\.now\b/u },
  { label: 'new Date()', pattern: /\bnew\s+Date\s*\(\s*\)/u },
  { label: 'performance.now', pattern: /\bperformance\.now\b/u },
  { label: 'crypto randomness', pattern: /\bcrypto\.(?:getRandomValues|randomUUID|randomBytes|randomInt)\b/u },
];

function purityViolations(source: string): string[] {
  return forbiddenPatterns
    .filter(({ pattern }) => pattern.test(source))
    .map(({ label }) => label);
}

async function findSourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
      return entry.isDirectory() ? findSourceFiles(url) : [url];
    }),
  );

  return files.flat().filter((file) => sourceExtensions.includes(extname(fileURLToPath(file))));
}

describe('core purity', () => {
  it('recognizes every prohibited dependency or nondeterministic API', () => {
    const prohibitedExamples = [
      "import React from 'react';",
      "import 'zustand/middleware';",
      "import { readFile } from 'node:fs';",
      'const fs = await import(`node:fs`);',
      "import fs from 'fs';",
      'const fs = require(`fs`);',
      "import path from 'path';",
      'process.cwd();',
      'globalThis.process;',
      'Math.random();',
      'Date.now();',
      'new Date().getTime();',
      'performance.now();',
      'crypto.randomUUID();',
    ];

    for (const example of prohibitedExamples) {
      expect(purityViolations(example), example).not.toHaveLength(0);
    }
  });

  it('allows the ordinary word "process" in comments, strings, and properties', () => {
    const allowedExamples = [
      '/** process one week of activities */',
      "throw new Error('cannot process action');",
      'const step = event.process;',
      'function processWeek() {}',
    ];

    for (const example of allowedExamples) {
      expect(purityViolations(example), example).toHaveLength(0);
    }
  });

  it('keeps src/core independent of UI, Node I/O, and ambient randomness', async () => {
    const files = await findSourceFiles(coreDirectory);
    const coreRoot = fileURLToPath(coreDirectory);
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const violation of purityViolations(source)) {
        violations.push(`${relative(coreRoot, fileURLToPath(file))}: ${violation}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
