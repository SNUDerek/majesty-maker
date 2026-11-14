import princess from '../../../assets/portraits/portrait_princess_right_360x540.webp';
import knight from '../../../assets/portraits/portrait_hedge_knight_right_360x540.webp';
import hermit from '../../../assets/portraits/portrait_hermit_right_360x540.webp';
import smuggler from '../../../assets/portraits/portrait_smuggler_right_360x540.webp';
import noble from '../../../assets/portraits/portrait_noble_male_right_360x540.webp';
import student from '../../../assets/portraits/portrait_student_male_right_360x540.webp';
import merchant from '../../../assets/portraits/portrait_merchant_male_right_360x540.webp';

export const CHARACTERS: Record<string, { name: string; portrait: string }> = {
  scion: { name: 'Joan', portrait: princess },
  father: { name: 'Gerald', portrait: noble },
  hedge_knight: { name: 'Hedge Knight', portrait: knight },
  hermit: { name: 'Hermit', portrait: hermit },
  smuggler: { name: 'Smuggler', portrait: smuggler },
  squire: { name: 'Squire', portrait: noble },
  novice: { name: 'Heretic Novice', portrait: student },
  urchin: { name: 'Urchin', portrait: merchant },
  watch_captain: { name: 'Watch Captain', portrait: merchant },
  brother_librarian: { name: 'Brother Librarian', portrait: student },
  alewife: { name: 'Alewife', portrait: merchant },
  stablemaster: { name: 'Stablemaster', portrait: merchant },
};

export function characterName(id: string, inputs: { scion: string; player: string }): string {
  return id === 'scion' ? inputs.scion : id === 'father' ? inputs.player : CHARACTERS[id]?.name ?? id;
}
