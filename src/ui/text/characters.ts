import princess from '../../../assets/portraits/portrait_princess_right_360x540.webp';
import knight from '../../../assets/portraits/portrait_hedge_knight_right_360x540.webp';
import hermit from '../../../assets/portraits/portrait_hermit_right_360x540.webp';
import smuggler from '../../../assets/portraits/portrait_smuggler_right_360x540.webp';
import playerPortrait from '../../../assets/portraits/portrait_player_right_360x540.webp';
import student from '../../../assets/portraits/portrait_student_male_right_360x540.webp';
import novice from '../../../assets/portraits/portrait_novice_right_360x540.webp';
import merchant from '../../../assets/portraits/portrait_merchant_male_right_360x540.webp';
import stablemaster from '../../../assets/portraits/portrait_stablemaster_right_360x540.webp';
import baker from '../../../assets/portraits/portrait_baker_male_right_360x540.webp';
import squire from '../../../assets/portraits/portrait_squire_right_360x540.webp';
import deacon from '../../../assets/portraits/portrait_deacon_right_360x540.webp';
import watchCaptain from '../../../assets/portraits/portrait_watch_captain_right_360x540.webp';
import urchin from '../../../assets/portraits/portrait_urchin_right_360x540.webp';
import alewife from '../../../assets/portraits/portrait_alewife_right_360x540.webp';

export const CHARACTERS: Record<string, { name: string; portrait: string }> = {
  scion: { name: 'Joan', portrait: princess },
  father: { name: 'Gerald', portrait: playerPortrait },
  player: { name: 'Gerald', portrait: playerPortrait },
  hedge_knight: { name: 'Bedivere', portrait: knight },
  hermit: { name: 'Diogenes', portrait: hermit },
  smuggler: { name: 'Hancock', portrait: smuggler },
  squire: { name: 'Sebastian', portrait: squire },
  novice: { name: 'Serena', portrait: novice },
  urchin: { name: 'Nicole', portrait: urchin },
  watch_captain: { name: 'Baldwin', portrait: watchCaptain },
  deacon: { name: 'Jerome', portrait: deacon },
  brother_librarian: { name: 'Brother Librarian', portrait: student },
  alewife: { name: 'Helga', portrait: alewife },
  merchant: { name: 'Merchant', portrait: merchant },
  baker: { name: 'Baker', portrait: baker },
  stablemaster: { name: 'Olaf', portrait: stablemaster },
};

export function characterName(id: string, inputs: { scion: string; player: string }): string {
  return id === 'scion' ? inputs.scion : id === 'father' || id === 'player' ? inputs.player : CHARACTERS[id]?.name ?? id;
}
