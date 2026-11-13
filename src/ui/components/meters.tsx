import type { Estate } from '../../core/index.js';
import { ESTATE_BAR } from '../assets.js';
import { ESTATE_LABEL, signed } from '../text/labels.js';
import { Bar, EstateIcon } from './basic.js';

/** Fraction of the ceiling at which the gauge warns. */
export const WARNING_RATIO = 0.8;

/**
 * 0–100 track: fill = current, ghost = projected, hatched above the ceiling.
 * Colour is never the only cue: the label and numbers are always shown.
 */
export function ConditionGauge({
  kind, value, ceiling, projected,
}: { kind: 'fatigue' | 'melancholy'; value: number; ceiling: number; projected?: number }) {
  const label = kind === 'fatigue' ? 'Fatigue' : 'Melancholy';
  const shown = projected ?? value;
  const warning = shown >= ceiling * WARNING_RATIO;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const low = Math.min(value, shown);
  const high = Math.max(value, shown);
  return (
    <div className={`gauge gauge--${kind} ${warning ? 'gauge--warning' : ''}`}>
      <div className="gauge__head">
        <span>{label}</span>
        <span className="num">
          {projected !== undefined && projected !== value ? `${value} → ${projected}` : value} / {ceiling}
        </span>
      </div>
      <div className="gauge__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={ceiling} aria-valuenow={shown}>
        <div className="gauge__fill" style={{ width: `${clamp(low)}%` }} />
        {high > low && <div className="gauge__ghost" style={{ left: `${clamp(low)}%`, width: `${clamp(high) - clamp(low)}%` }} />}
        <div className="gauge__locked" style={{ width: `${100 - clamp(ceiling)}%` }} />
        <div className="gauge__tick" style={{ left: `calc(${clamp(ceiling)}% - 1px)` }} />
      </div>
      {warning && <span className="gauge__warning">{shown >= ceiling ? 'Collapse!' : 'Near collapse'}</span>}
    </div>
  );
}

export function StatBlock({ estate, value, delta }: { estate: Estate; value: number; delta?: number }) {
  return (
    <div className="stat">
      <span className="stat__icon"><EstateIcon estate={estate} /></span>
      <span className="stat__name">{ESTATE_LABEL[estate]}</span>
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
