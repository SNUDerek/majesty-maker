import { readdir, readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDirectory = new URL('../core/', import.meta.url);

const forbiddenPatterns: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  { label: 'React', pattern: /(?:from\s*|import\s*\(|import\s*|require\s*\()['"]react(?:\/[^'"]*)?['"]/u },
  { label: 'Zustand', pattern: /(?:from\s*|import\s*\(|import\s*|require\s*\()['"]zustand(?:\/[^'"]*)?['"]/u },
  { label: 'Node built-in', pattern: /(?:from\s*|import\s*\(|import\s*|require\s*\()['"]node:[^'"]+['"]/u },
  { label: 'fs', pattern: /(?:from\s*|import\s*\(|import\s*|require\s*\()['"]fs(?:\/[^'"]*)?['"]/u },
  { label: 'path', pattern: /(?:from\s*|import\s*\(|import\s*|require\s*\()['"]path(?:\/[^'"]*)?['"]/u },
  { label: 'process', pattern: /\bprocess\b/u },
  { label: 'Math.random', pattern: /\bMath\.random\b/u },
  { label: 'Date.now', pattern: /\bDate\.now\b/u },
];

function purityViolations(source: string): string[] {
  return forbiddenPatterns
    .filter(({ pattern }) => pattern.test(source))
    .map(({ label }) => label);
}

async function findTypeScriptFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
      return entry.isDirectory() ? findTypeScriptFiles(url) : [url];
    }),
  );

  return files.flat().filter((file) => ['.ts', '.tsx', '.js', '.jsx'].includes(extname(file.pathname)));
}

describe('core purity', () => {
  it('recognizes every prohibited dependency or nondeterministic API', () => {
    const prohibitedExamples = [
      "import React from 'react';",
      "import 'zustand/middleware';",
      "import { readFile } from 'node:fs';",
      "import fs from 'fs';",
      "import path from 'path';",
      'process.cwd();',
      'Math.random();',
      'Date.now();',
    ];

    for (const example of prohibitedExamples) {
      expect(purityViolations(example), example).not.toHaveLength(0);
    }
  });

  it('keeps src/core independent of UI, Node I/O, and ambient randomness', async () => {
    const files = await findTypeScriptFiles(coreDirectory);
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const violation of purityViolations(source)) {
        violations.push(`${relative(coreDirectory.pathname, file.pathname)}: ${violation}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
