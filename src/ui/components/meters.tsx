import type { Estate } from '../../core/index.js';
import { CONDITION_BAR, ESTATE_BAR } from '../assets.js';
import { ESTATE_LABEL, signed } from '../text/labels.js';
import { Bar, EstateIcon } from './basic.js';

/** Fraction of the ceiling at which the gauge warns. */
export const WARNING_RATIO = 0.8;

/**
 * Fatigue / Melancholy on the Kenney bar: fill = current, faded fill = the
 * projection when it rises, hatched from the ceiling to 100. Falling
 * projections (rests) show the new value as the fill and the old as the
 * faded part, so the drop is visible. Label and numbers are always shown.
 */
export function ConditionGauge({
  kind, value, ceiling, projected,
}: { kind: 'fatigue' | 'melancholy'; value: number; ceiling: number; projected?: number }) {
  const label = kind === 'fatigue' ? 'Fatigue' : 'Melancholy';
  const shown = projected ?? value;
  const warning = shown >= ceiling * WARNING_RATIO;
  return (
    <div className={`gauge gauge--${kind} ${warning ? 'gauge--warning' : ''}`}>
      <div className="gauge__head">
        <span>{label}</span>
        <span className="num">
          {projected !== undefined && projected !== value ? `${value} → ${projected}` : value} / {ceiling}
        </span>
      </div>
      <Bar value={Math.min(value, shown)} ghost={Math.max(value, shown)} cap={ceiling}
        colour={CONDITION_BAR[kind]} label={label} />
      {warning && <span className="gauge__warning">{shown >= ceiling ? 'Collapse!' : 'Near collapse'}</span>}
    </div>
  );
}

export function StatBlock({ estate, value, delta }: { estate: Estate; value: number; delta?: number }) {
  return (
    <div className="stat">
      <span className="stat__icon"><EstateIcon estate={estate} /></span>
      <span className={`stat__name st st--${estate}`}>{ESTATE_LABEL[estate]}</span>
      <span className="stat__value num">
        {value}
        {delta !== undefined && delta !== 0 && (
          <span className={`stat__delta ${delta > 0 ? 'good' : 'bad'}`}>{signed(delta)}</span>
        )}
      </span>
      <span className="stat__bar"><Bar value={value} colour={ESTATE_BAR[estate]} label={ESTATE_LABEL[estate]} /></span>
    </div>
  );
}
