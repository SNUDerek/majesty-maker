import { Stage } from './components/Stage.js';
import { CONFIG } from './config.js';
import { Gallery } from './screens/Gallery.js';
import './styles/components.css';

const params = new URLSearchParams(window.location.search);

export function App() {
  return <Stage>{params.has('gallery') ? <Gallery config={CONFIG} /> : <Gallery config={CONFIG} />}</Stage>;
}
