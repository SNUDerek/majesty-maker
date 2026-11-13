import { useEffect, useState, type ReactNode } from 'react';

const WIDTH = 1280;
const HEIGHT = 720;

function fitScale(): number {
  return Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
}

/** Fixed 1280×720 logical stage scaled to the window with CSS `zoom`, letterboxed. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(fitScale);
  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div className="stage-host">
      <div className="stage" style={{ zoom: scale }}>{children}</div>
    </div>
  );
}

/** A full-stage background layer. */
export function Scene({ image, scrim = false, children }: { image: string; scrim?: boolean; children?: ReactNode }) {
  return (
    <div className={scrim ? 'scene scene--scrim' : 'scene'} style={{ backgroundImage: `url(${image})` }}>
      {children}
    </div>
  );
}
