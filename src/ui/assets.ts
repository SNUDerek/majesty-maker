/**
 * Asset registry (docs/archive/ui-technical-plan.md §3.3). Every file the UI uses is
 * imported here so a missing file fails the build. Keyed by content id.
 */
import type { ActivityId, Estate, LunarPhase } from '../core/index.js';
import type { IntroPanelId } from './text/intro.js';

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
import intro01A from '../../assets/misc/intro_panels/intro_01A_1024x768.webp';
import intro01B from '../../assets/misc/intro_panels/intro_01B_1024x768.webp';
import intro02 from '../../assets/misc/intro_panels/intro_02_1024x768.webp';
import intro03 from '../../assets/misc/intro_panels/intro_03_1024x768.webp';
import intro04A from '../../assets/misc/intro_panels/intro_04A_1024x768.webp';
import intro04C from '../../assets/misc/intro_panels/intro_04C_1024x768.webp';
import intro05 from '../../assets/misc/intro_panels/intro_05_1024x768.webp';
import intro06 from '../../assets/misc/intro_panels/intro_06_1024x768.webp';
import intro07 from '../../assets/misc/intro_panels/intro_07_1024x768.webp';
import intro08 from '../../assets/misc/intro_panels/intro_08_1024x768.webp';
import barBackL from '../../assets/ui/PNG/barBack_horizontalLeft.png';
import barBackM from '../../assets/ui/PNG/barBack_horizontalMid.png';
import barBackR from '../../assets/ui/PNG/barBack_horizontalRight.png';
import barRedL from '../../assets/ui/PNG/barRed_horizontalLeft.png';
import barRedM from '../../assets/ui/PNG/barRed_horizontalMid.png';
import barRedR from '../../assets/ui/PNG/barRed_horizontalRight.png';
import barBlueL from '../../assets/ui/PNG/barBlue_horizontalLeft.png';
import barBlueM from '../../assets/ui/PNG/barBlue_horizontalMid.png';
import barBlueR from '../../assets/ui/PNG/barBlue_horizontalRight.png';
import barGreenL from '../../assets/ui/PNG/barGreen_horizontalLeft.png';
import barGreenM from '../../assets/ui/PNG/barGreen_horizontalMid.png';
import barGreenR from '../../assets/ui/PNG/barGreen_horizontalRight.png';
import barYellowL from '../../assets/ui/PNG/barYellow_horizontalLeft.png';
import barYellowM from '../../assets/ui/PNG/barYellow_horizontalMid.png';
import barYellowR from '../../assets/ui/PNG/barYellow_horizontalRight.png';

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

export type BarColour = 'back' | 'red' | 'blue' | 'green' | 'yellow';

/** Three-part bars: [left cap, repeating middle, right cap]. */
export const BAR: Record<BarColour, readonly [string, string, string]> = {
  back: [barBackL, barBackM, barBackR],
  red: [barRedL, barRedM, barRedR],
  blue: [barBlueL, barBlueM, barBlueR],
  green: [barGreenL, barGreenM, barGreenR],
  yellow: [barYellowL, barYellowM, barYellowR],
};

export const ESTATE_BAR: Record<Estate, BarColour> = {
  bellatores: 'red',
  oratores: 'blue',
  laboratores: 'green',
};

export const INTRO_PANEL: Record<IntroPanelId, string> = {
  '01A': intro01A,
  '01B': intro01B,
  '02': intro02,
  '03': intro03,
  '04A': intro04A,
  '04C': intro04C,
  '05': intro05,
  '06': intro06,
  '07': intro07,
  '08': intro08,
};
