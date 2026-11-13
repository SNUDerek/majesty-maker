import type { CampaignState, RulesConfig, ZodiacSign } from '../../core/index.js';
import { getCalendar, getDerivedStats } from '../../core/index.js';
import { IMAGES, MOON } from '../assets.js';
import { LUNAR_LABEL, MONTHS, MONTH_SIGN, SIGNS_IN_SHEET_ORDER, SIGN_LABEL, SOLAR_LABEL } from '../text/labels.js';
import { Button, CoinAmount } from './basic.js';

/** One sign cropped from the 4×3 zodiac sheet. */
export function ZodiacGlyph({ sign, height = 44 }: { sign: ZodiacSign; height?: number }) {
  const index = SIGNS_IN_SHEET_ORDER.indexOf(sign);
  const col = index % 4;
  const row = Math.floor(index / 4);
  return (
    <span
      className="zodiac"
      role="img"
      aria-label={SIGN_LABEL[sign]}
      style={{
        width: Math.round((height * 226) / 240), height,
        backgroundImage: `url(${IMAGES.zodiacSheet})`,
        backgroundPosition: `${col * 33.3333}% ${row * 50}%`,
      }}
    />
  );
}

export function DateBlock({ state, config }: { state: CampaignState; config: RulesConfig }) {
  const cal = getCalendar(state, config);
  const sign = MONTH_SIGN[cal.currentMonth]!;
  return (
    <div className="date">
      <ZodiacGlyph sign={sign} />
      <div className="date__text">
        <span className="date__main">Week {cal.weekOfMonth + 1} of {MONTHS[cal.currentMonth]}, {cal.displayYear}</span>
        <span className="date__sub">{state.scionName}, age {cal.age} · {cal.weeksRemaining} weeks remain</span>
      </div>
    </div>
  );
}

export function TopBar({ state, config, onMenu }: { state: CampaignState; config: RulesConfig; onMenu: () => void }) {
  const derived = getDerivedStats(state, config);
  return (
    <header className="topbar">
      <DateBlock state={state} config={config} />
      <span className="moon"><img src={MOON[derived.lunarPhase]} alt="" />{LUNAR_LABEL[derived.lunarPhase]}</span>
      {derived.solarAspect !== 'none' && <span className="badge">{SOLAR_LABEL[derived.solarAspect]}</span>}
      <span className="topbar__spacer" />
      <span title="Treasury"><CoinAmount amount={state.treasury} /></span>
      <Button onClick={onMenu}>Title</Button>
    </header>
  );
}

/** Waystations as nodes, the final gauntlet as a cross. `furthest` = waystations reached. */
export function RouteStrip({ furthest, total }: { furthest: number; total: number }) {
  const nodes = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="route" aria-label={`Waystations reached: ${furthest} of ${total}`}>
      {nodes.map((n) => (
        <span key={n} style={{ display: 'contents' }}>
          <span className={`route__line ${n <= furthest ? '' : 'route__line--todo'}`} />
          <span
            className={`route__node ${n <= furthest ? 'route__node--done' : ''} ${n === furthest + 1 ? 'route__node--next' : ''}`}
            title={`Waystation ${n}`}
          />
        </span>
      ))}
      <span className={`route__line ${furthest >= total ? '' : 'route__line--todo'}`} />
      <span className="route__final" title="The capital">✠</span>
    </div>
  );
}
