/**
 * Asset registry (docs/ui-technical-plan.md §3.3). Every file the UI uses is
 * imported here so a missing file fails the build. Keyed by content id.
 */
import type { ActivityId, Estate, LunarPhase } from '../core/index.js';

import bgCapital from '../../assets/backgrounds/background_capital_1920x1080.webp';
import bgHome from '../../assets/backgrounds/background_home_1920x1080.webp';
import bgJob from '../../assets/backgrounds/background_job_1920x1080.webp';
import bgPilgrimage from '../../assets/backgrounds/background_pilgrimage_1920x1080.webp';
import bgSchool from '../../assets/backgrounds/background_school_1920x1080.webp';
import bgWaystation from '../../assets/backgrounds/background_waystation_1920x1080.webp';
import title from '../../assets/misc/title_1920x1080.webp';
import parchment from '../../assets/misc/parchment_1600x1080.webp';
import zodiacSheet from '../../assets/misc/zodiac_signs_905x720.webp';
import moonNew from '../../assets/misc/moon_phases/moon_new.png';
import moonWaxing from '../../assets/misc/moon_phases/moon_first_quarter.png';
import moonFull from '../../assets/misc/moon_phases/moon_full.png';
import moonWaning from '../../assets/misc/moon_phases/moon_third_quarter.png';
import princessFull from '../../assets/portraits/main_princess_360x720.webp';
import portraitPrincess from '../../assets/portraits/portrait_princess_right_360x540.webp';
import portraitHedgeKnight from '../../assets/portraits/portrait_hedge_knight_right_360x540.webp';
import portraitHermit from '../../assets/portraits/portrait_hermit_right_360x540.webp';
import portraitSmuggler from '../../assets/portraits/portrait_smuggler_right_360x540.webp';
import portraitMerchant from '../../assets/portraits/portrait_merchant_male_right_360x540.webp';
import portraitNoble from '../../assets/portraits/portrait_noble_male_right_360x540.webp';
import portraitStudent from '../../assets/portraits/portrait_student_male_right_360x540.webp';
import iconSword from '../../assets/items/icon_sword.png';
import iconBook from '../../assets/items/icon_book.png';
import iconHammer from '../../assets/items/icon_hammer.png';
import itemTheriac from '../../assets/items/item_theriac.png';
import itemWort from '../../assets/items/item_st_johns_wort.png';
import itemMetheglin from '../../assets/items/item_metheglin.png';
import itemGambeson from '../../assets/items/item_gambeson.png';
import itemRelic from '../../assets/items/item_saints_relic.png';
import itemWeightedCoin from '../../assets/items/item_weighted_coin.png';
import coin from '../../assets/items/gold/gold_pile.png';

export type SceneId = 'title' | 'home' | 'school' | 'job' | 'pilgrimage' | 'waystation' | 'capital';

export const BACKGROUND: Record<SceneId, string> = {
  title,
  home: bgHome,
  school: bgSchool,
  job: bgJob,
  pilgrimage: bgPilgrimage,
  waystation: bgWaystation,
  capital: bgCapital,
};

export const MOON: Record<LunarPhase, string> = {
  new: moonNew,
  waxing: moonWaxing,
  full: moonFull,
  waning: moonWaning,
};

export const ESTATE_ICON: Record<Estate, string> = {
  bellatores: iconSword,
  oratores: iconBook,
  laboratores: iconHammer,
};

/** Card art per activity; absent ids fall back to the Estate icon. */
export const ACTIVITY_PORTRAIT: Partial<Record<ActivityId, string>> = {
  hedge_knight: portraitHedgeKnight,
  hermit: portraitHermit,
  smuggler: portraitSmuggler,
  alehouse: portraitMerchant,
  scriptorium: portraitStudent,
  banquet: portraitNoble,
};

export const ITEM_ICON: Record<string, string> = {
  theriac: itemTheriac,
  st_johns_wort: itemWort,
  metheglin: itemMetheglin,
  gambeson: itemGambeson,
  saints_relic: itemRelic,
  weighted_coin: itemWeightedCoin,
};

export const IMAGES = { parchment, zodiacSheet, princessFull, portraitPrincess, coin };
