/**
 * The pilgrimage tutorial (docs/ui-playtest-plan.md §6). Pure: every number
 * comes from the rules config, and the "seen" flag goes through a storage
 * handle so it can be tested without a browser.
 */
import type { Estate, RulesConfig } from '../../core/index.js';
import type { SaveStorage } from './persistence.js';
import { ESTATES, ESTATE_LABEL, LUNAR_LABEL, roadMoonLabel, signed, times } from '../text/labels.js';

export interface TutorialPage {
  title: string;
  paragraphs: string[];
  /** Page 2 draws the triangle: each winner beats its loser. */
  beats?: { winner: Estate; loser: Estate }[];
}

const BURDEN: Record<Estate, string> = {
  bellatores: 'Fatigue',
  oratores: 'Melancholy',
  laboratores: 'carried Coin',
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function pilgrimageTutorial(config: RulesConfig): TutorialPage[] {
  const { route, encounters, failure, astrology } = config;
  const { matchupPct } = encounters;
  const bonuses = route.roadBonus.map((b) => `${signed(b)}%`).join(', ');
  const beats = ESTATES.map((winner) => ({ winner, loser: encounters.beats[winner] }));
  const reset = failure.wipeoutBurdenReset;
  return [
    {
      title: 'The road',
      paragraphs: [
        `The road to the capital passes ${plural(route.regularSegments, 'waystation')}, then the Final Gauntlet.`,
        `Each stretch of road holds ${plural(route.encountersPerSegment, 'encounter')}; the Final Gauntlet holds ${route.finalEncounters}. Entering a stretch costs one week. Setting out from home also costs a ${route.departureFee} Coin fee and the Coin she carries.`,
        `Early roads are easier: a road bonus of ${bonuses} is added to every check, and ${signed(route.finalRoadBonus)}% in the Final Gauntlet.`,
        'A secured waystation is kept: the next pilgrimage sets out from the furthest one. There she may return home to bank her Coin, or continue at once.',
      ],
    },
    {
      title: 'The three orders',
      paragraphs: [
        "Every encounter is a threat from one of the three orders; the card's colour shows who stands in her way. She meets it with one of her own Estates.",
        `The order that beats the threat has Advantage: her Estate counts ${times(matchupPct.advantage)}. The same order is Even (${times(matchupPct.neutral)}); the order the threat beats has Disadvantage (${times(matchupPct.disadvantage)}).`,
        `Her chance is that Estate times the matchup, plus the road bonus, kept between ${encounters.successMin}% and ${encounters.successMax}%. Success earns 1–${encounters.rewardCoinDie} carried Coin.`,
      ],
      beats,
    },
    {
      title: 'Failure',
      paragraphs: [
        `A failed check costs ${encounters.failurePenalty} of the burden her approach strains: ${ESTATES.map((e) => `${ESTATE_LABEL[e]} → ${BURDEN[e]}`).join(', ')}.`,
        'Reaching the Fatigue ceiling (set by Bellatores) or the Melancholy ceiling (set by Oratores), or being unable to pay, is a wipeout.',
        `After a wipeout she is carried home: she keeps only the carried Coin covered by Purse Protection, pays a medical fee of up to ${failure.wipeoutMedicalFeeMax} Coin and convalesces for ${plural(failure.wipeoutConvalescenceWeeks, 'week')}${typeof reset === 'object' ? `, recovering ${reset.recovery} of each burden per week` : ''}.`,
        `Purse Protection grows with Laboratores (half her Laboratores, as a percentage)${failure.purseProtection.appliesToLabFailures ? ' and also shrinks the Coin lost on failed Laboratores checks' : ''}.`,
      ],
    },
    {
      title: 'Moon and retreat',
      paragraphs: [
        'The moon is fixed when she enters a stretch of road and holds until the next waystation.',
        `${roadMoonLabel('new', config)}.`,
        `${roadMoonLabel('full', config)}.`,
        `${LUNAR_LABEL.waxing} and ${LUNAR_LABEL.waning}: no effect on the road.`,
        `Between encounters she may retreat home. She keeps the Coin carried from home and ${failure.retreatLootRetentionPct}% of the loot, pays a ${failure.retreatToll} Coin toll, and no time passes.`,
      ],
    },
  ];
}

export const TUTORIAL_SEEN_KEY = 'hidden-scion:seen:pilgrimage-tutorial';

/** True only when the flag reads back; blocked or failing storage means "show it". */
export function tutorialSeen(storage: SaveStorage | null): boolean {
  try {
    return storage?.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage: SaveStorage | null): void {
  try {
    storage?.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // Storage full or blocked: she'll see it again next time.
  }
}
