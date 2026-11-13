/**
 * Intro script (docs/ui-handoff.md §4.2, "placeholder intro text"). Panel ids
 * match assets/misc/intro_panels/intro_<id>_1024x768.webp; 04B is skipped.
 */
export type IntroPanelId = '01A' | '01B' | '02' | '03' | '04A' | '04C' | '05' | '06' | '07' | '08';

export const INTRO: readonly { panel: IntroPanelId; text: string }[] = [
  { panel: '01A', text: 'One score and four years ago, the good king Cornelius brought peace to these lands.' },
  { panel: '01B', text: 'His was a fair and just rule, and he loved all his subjects, as they loved him.' },
  { panel: '02', text: 'But the King loved no one above his bride, the kind-hearted Queen Isolde.' },
  { panel: '03', text: 'On the day of the Conjunction, their child was born, a daughter. The kingdom was overcome with joy.' },
  { panel: '04A', text: 'But the jealous courtier Vortigan, spurned by Queen Isolde, plotted to overthrow king Cornelius.' },
  { panel: '04C', text: 'He led a treasonous band of knights against the king. Vortigan himself smote the king on the field of battle.' },
  { panel: '05', text: "But you know this, of course, as it was you, brave knight, who fled the castle with the king's child." },
  { panel: '06', text: 'Though your holdings are modest, you have raised her well these last fourteen years, as if she were your own.' },
  { panel: '07', text: 'But now, My Lord, the next Conjunction approaches, and I feel a great foreboding in my breast.' },
  { panel: '08', text: 'In dreams I see a great fire welling in your daughter, but to what end, I cannot know...' },
];
