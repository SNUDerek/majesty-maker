import { useEffect, useId, useRef, type ReactNode } from 'react';
import { sourcesLine, weeksLine, type ResultSummary } from '../engine/summarize.js';
import { signed } from '../text/labels.js';
import { Button, Panel } from './basic.js';
import { quantityClass } from './stats.js';

export function Modal({
  title, children, actions, className = '',
}: { title: ReactNode; children?: ReactNode; actions: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const modal = ref.current;
    if (modal === null) return;
    // Remove background controls from keyboard and assistive-technology navigation.
    const siblings = Array.from(modal.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== modal);
    const inertBefore = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    modal.addEventListener('keydown', trapTab);
    // Focus the primary (last) action so Enter/Space dismisses.
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('.modal__actions button');
    buttons?.[buttons.length - 1]?.focus();
    return () => {
      modal.removeEventListener('keydown', trapTab);
      siblings.forEach((element, index) => { element.inert = inertBefore[index]!; });
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      // The opener is gone (e.g. the screen changed under a result): focus the new screen's main action.
      else document.querySelector<HTMLElement>('[data-autofocus]:not(:disabled), .scene .btn--primary:not(:disabled)')?.focus();
    };
  }, []);
  return (
    <div ref={ref} className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div>
        <Panel variant="parchment" className={`modal ${className}`}>
          <div id={titleId}>{typeof title === 'string' ? <h2>{title}</h2> : title}</div>
          {children}
          <div className="modal__actions">{actions}</div>
        </Panel>
      </div>
    </div>
  );
}

/** Net changes, coloured by quantity (Estate colour, grey conditions, ink Coin), with sources. */
export function ResultRows({ rows }: { rows: ResultSummary['rows'] }) {
  return (
    <table className="result__rows">
      <tbody>
        {rows.map((row) => (
          <tr key={row.quantity}>
            <td className={quantityClass(row.quantity)}>{row.label}</td>
            <td className={`num ${quantityClass(row.quantity)}`}>{signed(row.amount)}</td>
            <td>{sourcesLine(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ResultPanel({ summary, onDismiss }: { summary: ResultSummary; onDismiss: () => void }) {
  return (
    <Modal
      className={`result result--${summary.tone}`}
      title={
        <div className="result__head">
          <h2>{summary.title}</h2>
          {summary.detail !== undefined && <p>{summary.detail}</p>}
        </div>
      }
      actions={<Button primary onClick={onDismiss}>Continue</Button>}
    >
      {summary.rows.length > 0 && (
        <ResultRows rows={summary.rows} />
      )}
      <p className="muted" style={{ marginTop: 8 }}>{weeksLine(summary.weeks)}</p>
      {summary.notes.length > 0 && <ul className="result__notes">{summary.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </Modal>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 5000);
    return () => clearTimeout(id);
  }, [message, onClose]);
  return (
    <div className="toast" role="alert">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose}>×</button>
    </div>
  );
}
