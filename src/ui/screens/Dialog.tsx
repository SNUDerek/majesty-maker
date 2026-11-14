import { useEffect, useRef, useState } from 'react';
import { Story } from 'inkjs';
import arrow from '../../../assets/ui/PNG/arrowBeige_right.png';
import { BACKGROUND, type SceneId } from '../assets.js';
import { openScene, type DialogInputs, type DialogStep } from '../engine/dialog.js';
import { prefersReducedMotion } from '../engine/motion.js';
import { CHARACTERS, characterName } from '../text/characters.js';

/** Keep the outgoing art behind the incoming layer until its fade completes. */
function Crossfade({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [previous, setPrevious] = useState(src);
  useEffect(() => {
    const timer = setTimeout(() => setPrevious(src), 300);
    return () => clearTimeout(timer);
  }, [src]);
  return <>
    {previous !== src && <img className={className} src={previous} alt="" aria-hidden="true" />}
    <img key={src} className={className} src={src} alt={alt} />
  </>;
}

/** Remount with a scene key when opening another scene. Rewards are display-only. */
export function Dialog({ json, knot, inputs, onFinish, background = 'home', left = 'scion', rewards = [] }: {
  json: string; knot: string; inputs: DialogInputs; onFinish: () => void;
  background?: SceneId; left?: string; rewards?: readonly string[];
}) {
  const [session] = useState(() => {
    const cursor = openScene(new Story(json), knot, inputs);
    const step = cursor.next();
    return { cursor, initial: { step, bg: step.kind === 'line' ? step.bg ?? background : background,
      left: step.kind === 'line' ? step.left ?? left : left,
      right: step.kind === 'line' ? step.right ?? (step.speaker !== (step.left ?? left) ? step.speaker : undefined) : undefined } };
  });
  const cursor = session.cursor;
  const [view, setView] = useState(session.initial);
  const [closing, setClosing] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const rewardShown = useRef(false);
  const advanceRef = useRef<() => void>(() => undefined);
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { buttonRef.current?.focus(); }, [view.step.kind]);
  useEffect(() => {
    if (closing) {
      const timer = setTimeout(onFinish, reduced ? 0 : 300);
      return () => clearTimeout(timer);
    }
  }, [closing, onFinish, reduced]);
  function show(step: DialogStep) {
    if (step.kind === 'end' && rewards.length && !rewardShown.current) {
      rewardShown.current = true;
      step = { kind: 'line', style: 'narration', text: `Received: ${rewards.join(', ')}` };
    }
    if (step.kind === 'end') { setClosing(true); return; }
    setView(previous => {
      if (step.kind !== 'line') return { ...previous, step };
      const main = step.left ?? previous.left;
      return { step, bg: step.bg ?? previous.bg, left: main,
        right: step.right ?? (step.speaker && step.speaker !== main ? step.speaker : previous.right) };
    });
  }
  advanceRef.current = () => { if (!closing && view.step.kind !== 'choice') show(cursor.next()); };
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (!event.repeat) advanceRef.current();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const step = view.step;
  return <div ref={dialogRef} className={`dialog${closing ? ' dialog--closing' : ''}`} role="dialog" aria-modal="true" aria-label="Story scene">
    <Crossfade className="dialog__background" src={BACKGROUND[view.bg as SceneId] ?? BACKGROUND.home} alt="" />
    {(['left', 'right'] as const).map(side => {
      const id = view[side];
      return id && CHARACTERS[id] && <div key={side} className={`dialog__portrait dialog__portrait--${side}`}>
        <Crossfade className={step.kind === 'line' && step.speaker && step.speaker !== id ? 'dialog__dim' : ''}
          src={CHARACTERS[id].portrait} alt={characterName(id, inputs)} />
      </div>;
    })}
    <div className="dialog__window" aria-live="polite">
      {step.kind === 'line' && <>
        {step.speaker && <div className="dialog__name">{characterName(step.speaker, inputs)}</div>}
        <p className={`dialog__text dialog__text--${step.style}`}>{step.text}</p>
        <button ref={buttonRef} className="dialog__advance" aria-label="Advance dialog" disabled={closing} onClick={() => advanceRef.current()}><img src={arrow} alt="" /></button>
      </>}
      {step.kind === 'choice' && <div className="dialog__choices">{step.options.map((choice, i) =>
        <button ref={i === 0 ? buttonRef : undefined} key={choice.index} disabled={closing} onClick={() => show(cursor.choose(choice.index))}>{choice.text}</button>)}</div>}
    </div>
  </div>;
}
