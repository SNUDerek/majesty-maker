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

/** Kenney three-part bar; `value` of `max`. */
export function Bar({ value, max = 100, colour, label }: { value: number; max?: number; colour: BarColour; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const [bl, bm, br] = BAR.back;
  const [l, m, r] = BAR[colour];
  return (
    <div className="bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="bar__track">
        <span className="bar__cap" style={{ backgroundImage: `url(${bl})` }} />
        <span className="bar__mid" style={{ backgroundImage: `url(${bm})` }} />
        <span className="bar__cap" style={{ backgroundImage: `url(${br})` }} />
      </div>
      {pct > 0 && (
        <div className="bar__fill" style={{ width: `max(${pct}%, 18px)` }}>
          <span className="bar__cap" style={{ backgroundImage: `url(${l})` }} />
          <span className="bar__mid" style={{ backgroundImage: `url(${m})` }} />
          <span className="bar__cap" style={{ backgroundImage: `url(${r})` }} />
        </div>
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
