import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import type { Estate } from '../../core/index.js';
import { BAR, ESTATE_ICON, IMAGES, type BarColour } from '../assets.js';
import { ESTATE_LABEL, signed } from '../text/labels.js';

export function Panel({
  variant = 'plain', title, className = '', style, children,
}: { variant?: 'plain' | 'parchment' | 'inset'; title?: ReactNode; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const bg: CSSProperties = variant === 'parchment' ? { backgroundImage: `url(${IMAGES.parchment})` } : {};
  return (
    <section className={`panel panel--${variant} ${className}`} style={{ ...bg, ...style }}>
      {title !== undefined && <h2 className="panel__title">{title}</h2>}
      {children}
    </section>
  );
}

export function Button({
  primary = false, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" className={`btn ${primary ? 'btn--primary' : ''} ${className}`} {...rest} />;
}

/** One three-part Kenney strip (caps + repeating middle) filling its box. */
function Strip({ colour }: { colour: BarColour }) {
  const [l, m, r] = BAR[colour];
  return (
    <>
      <span className="bar__cap" style={{ backgroundImage: `url(${l})` }} />
      <span className="bar__mid" style={{ backgroundImage: `url(${m})` }} />
      <span className="bar__cap" style={{ backgroundImage: `url(${r})` }} />
    </>
  );
}

const pctOf = (n: number, max: number) => Math.max(0, Math.min(100, (n / max) * 100));

/**
 * Kenney three-part bar; `value` of `max`. Optional `ghost` draws a faded
 * fill up to that value (a projection), and `cap` hatches the region from
 * `cap` to `max` (a ceiling). Both overlays are approximate by design: the
 * numbers are always printed next to the bar.
 */
export function Bar({ value, max = 100, colour, label, ghost, cap, now }: {
  value: number; max?: number; colour: BarColour; label: string; ghost?: number; cap?: number;
  /** Value announced to assistive tech; defaults to the ghost (projection) or the value. */
  now?: number;
}) {
  const pct = pctOf(value, max);
  const ghostPct = ghost === undefined ? 0 : pctOf(ghost, max);
  return (
    <div className="bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap ?? max} aria-valuenow={now ?? ghost ?? value}>
      <div className="bar__track"><Strip colour="back" /></div>
      {ghostPct > pct && (
        <div className="bar__fill bar__fill--ghost" style={{ width: `max(${ghostPct}%, 18px)` }}><Strip colour={colour} /></div>
      )}
      {pct > 0 && (
        <div className="bar__fill" style={{ width: `max(${pct}%, 18px)` }}><Strip colour={colour} /></div>
      )}
      {cap !== undefined && cap < max && (
        <>
          <div className="bar__cap-zone" style={{ left: `${pctOf(cap, max)}%` }} />
          <div className="bar__cap-tick" style={{ left: `calc(${pctOf(cap, max)}% - 1px)` }} />
        </>
      )}
    </div>
  );
}

export function EstateIcon({ estate, size = 32 }: { estate: Estate; size?: number }) {
  return <img className="estate-icon" src={ESTATE_ICON[estate]} width={size} height={size} alt={ESTATE_LABEL[estate]} />;
}

export function CoinAmount({ amount, sign = false }: { amount: number; sign?: boolean }) {
  return (
    <span className="coin num">
      <img src={IMAGES.coin} width={20} height={20} alt="" />
      {sign ? signed(amount) : amount}
      <span className="visually-hidden"> Coin</span>
    </span>
  );
}
