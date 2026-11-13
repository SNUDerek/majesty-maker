import { useEffect, useRef, type ReactNode } from 'react';
import { weeksLine, type ResultSummary } from '../engine/summarize.js';
import { signed } from '../text/labels.js';
import { Button, Panel } from './basic.js';

export function Modal({
  title, children, actions, className = '',
}: { title: ReactNode; children?: ReactNode; actions: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the primary (last) action so Enter/Space dismisses.
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('.modal__actions button');
    buttons?.[buttons.length - 1]?.focus();
  }, []);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div ref={ref}>
        <Panel variant="parchment" className={`modal ${className}`}>
          {children === undefined ? <h2>{title}</h2> : <>{typeof title === 'string' ? <h2>{title}</h2> : title}{children}</>}
          <div className="modal__actions">{actions}</div>
        </Panel>
      </div>
    </div>
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
        <table className="result__rows">
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.quantity}>
                <td>{row.label}</td>
                <td className={`num ${row.tone}`}>{signed(row.amount)}</td>
                <td>{row.sources.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
