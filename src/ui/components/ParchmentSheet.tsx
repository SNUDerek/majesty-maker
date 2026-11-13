import type { CSSProperties, ReactNode } from 'react';
import { IMAGES } from '../assets.js';

/**
 * Unframed parchment: the texture alone, stretched to the sheet, with content
 * padded inside its torn edge (~4% left, 2.5% right, curl at top-left, 5–7%
 * bottom). Used by the intro and, later, the pilgrimage tutorial.
 */
export function ParchmentSheet({ className = '', style, children }: {
  className?: string; style?: CSSProperties; children?: ReactNode;
}) {
  return (
    <div className={`parchment-sheet ${className}`} style={{ backgroundImage: `url(${IMAGES.parchment})`, ...style }}>
      {children}
    </div>
  );
}
