import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { App } from './App.js';

const FONTS = ['18px "IM Fell English"', '22px "Rotunda"', '32px "Rotunda"'];

/** Wait for the fonts (font-display: block) so the first frame isn't a fallback flash; give up after 3s. */
async function fontsReady(): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  const loads = Promise.all(FONTS.map((f) => document.fonts.load(f))).then(() => undefined);
  await Promise.race([loads, timeout]).catch(() => undefined);
}

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');

void fontsReady().then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
