import { inkPlugin } from './scripts/vite-plugin-ink.js';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), inkPlugin()],
  base: './',
});
