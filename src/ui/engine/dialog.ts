import { Story } from 'inkjs';
import { CHARACTERS } from '../text/characters.js';

export interface DialogInputs {
  scion: string;
  player: string;
  bellatores: number;
  oratores: number;
  laboratores: number;
}
export type DialogStep =
  | { kind: 'line'; style: 'speech' | 'thought' | 'narration'; speaker?: string; text: string;
      bg?: string; left?: string; right?: string }
  | { kind: 'choice'; options: { index: number; text: string }[] }
  | { kind: 'end' };
export interface DialogCursor {
  next(): DialogStep;
  choose(index: number): DialogStep;
}

export function openScene(story: Story, knot: string, inputs: DialogInputs): DialogCursor {
  story.ResetState();
  for (const [key, value] of Object.entries(inputs)) story.variablesState!.$(key, value);
  story.ChoosePathString(knot);
  function next(): DialogStep {
    const tags: { bg?: string; left?: string; right?: string } = {};
    while (story.canContinue) {
      const text = (story.Continue() ?? '').trim();
      for (const tag of story.currentTags ?? []) {
        const match = /^(bg|left|right):\s*(\S+)\s*$/.exec(tag);
        if (match) tags[match[1] as keyof typeof tags] = match[2]!;
      }
      if (!text) continue;
      const speech = /^([a-z_]+):\s*(.*)$/s.exec(text);
      if (speech && Object.hasOwn(CHARACTERS, speech[1]!)) {
        const body = speech[2]!;
        return { kind: 'line', style: body.startsWith('(') && body.endsWith(')') ? 'thought' : 'speech',
          speaker: speech[1]!, text: body, ...tags };
      }
      return { kind: 'line', style: 'narration', text, ...tags };
    }
    return story.currentChoices.length ? { kind: 'choice', options: story.currentChoices.map(c => ({ index: c.index, text: c.text })) }
      : { kind: 'end' };
  }
  return { next, choose(index) {
    if (story.canContinue || !story.currentChoices.some(c => c.index === index)) throw new RangeError('Invalid dialog choice');
    story.ChooseChoiceIndex(index);
    return next();
  } };
}
