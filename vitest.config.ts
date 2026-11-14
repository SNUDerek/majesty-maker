import { inkPlugin } from './scripts/vite-plugin-ink.js';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [inkPlugin()],
  test: {
    include: ['src/tests/**/*.test.ts'],
  },
});
