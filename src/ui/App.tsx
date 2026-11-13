import { BACKGROUND } from './assets.js';
import { Scene, Stage } from './components/Stage.js';

export function App() {
  return (
    <Stage>
      <Scene image={BACKGROUND.home} />
    </Stage>
  );
}
