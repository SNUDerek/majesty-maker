import type { Estate } from '../../core/index.js';
import type { OutcomePart } from '../engine/activities.js';
import type { Quantity } from '../engine/summarize.js';
import { ESTATE_LABEL, signed } from '../text/labels.js';
import { CoinAmount } from './basic.js';

/** CSS class for a quantity: Estate colour, grey for conditions, ink for Coin. */
export function quantityClass(quantity: Quantity): string {
  if (quantity === 'fatigue' || quantity === 'melancholy') return 'st st--cost';
  if (quantity === 'treasury' || quantity === 'carried') return 'st';
  return `st st--${quantity}`;
}

/** An Estate name in its colour. */
export function EstateName({ estate }: { estate: Estate }) {
  return <span className={`st st--${estate}`}>{ESTATE_LABEL[estate]}</span>;
}

/** One previewed fact, colour-coded; Coin is always the glyph, never the word as well. */
export function StatText({ part }: { part: OutcomePart }) {
  switch (part.kind) {
    case 'estate':
      return <span className={`st st--${part.estate}`}>{ESTATE_LABEL[part.estate]} {signed(part.amount)}</span>;
    case 'condition':
      return <span className="st st--cost">{part.condition === 'fatigue' ? 'Fatigue' : 'Melancholy'} {signed(part.amount)}</span>;
    case 'coin':
      return part.min === part.max
        ? <CoinAmount amount={part.min} sign />
        : <span className="coin num"><CoinAmount amount={part.min} sign /> to {signed(part.max)}</span>;
  }
}

/** Parts of one kind on a line, separated by middots; nothing when empty. */
export function StatLine({ parts, className = '' }: { parts: OutcomePart[]; className?: string }) {
  if (parts.length === 0) return null;
  return (
    <span className={`stat-line ${className}`}>
      {parts.map((p, i) => <span key={i}>{i > 0 && ' · '}<StatText part={p} /></span>)}
    </span>
  );
}
