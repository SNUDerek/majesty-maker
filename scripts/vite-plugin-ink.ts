import type { Plugin } from 'vite';
import { Compiler } from 'inkjs/full';

export function inkPlugin(): Plugin {
  return {
    name: 'ink',
    transform(source, id) {
      if (!id.endsWith('.ink')) return;
      if (/^\s*INCLUDE\b/m.test(source)) throw new Error(`${id}: INCLUDE is not supported; keep stories self-contained.`);
      const compiler = new Compiler(source);
      try {
        const story = compiler.Compile();
        return { code: `export default ${JSON.stringify(story.ToJson())};`, map: null };
      } catch {
        throw new Error(`${id}: ${compiler.errors.join('\n') || 'Ink compilation failed'}`);
      }
    },
  };
}
