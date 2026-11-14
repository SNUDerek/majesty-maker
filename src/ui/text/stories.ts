/// <reference types="vite/client" />
/// <reference path="../ink.d.ts" />
/** Every story thread in content/story, compiled by the ink plugin and read as beats (plan §6.1). */
import { loadBeats } from '../engine/story.js';

const files = import.meta.glob<string>('../../../content/story/*.ink', { eager: true, import: 'default' });

export const STORY = loadBeats(files);
