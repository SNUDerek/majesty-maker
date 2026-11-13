import { useState } from 'react';
import type { CampaignState } from '../../core/index.js';
import { Button } from '../components/basic.js';
import { ZodiacGlyph } from '../components/chrome.js';
import { Modal } from '../components/overlays.js';
import type { SlotId, SlotInfo } from '../engine/persistence.js';
import { SLOT_LABEL, slotSummary } from '../engine/slots.js';
import { CONFIG_LOADERS, type ConfigId } from '../config.js';
import { useGame } from '../useStore.js';

function SlotRow({ info, canSave, onSave, onLoad, onDelete }: {
  info: SlotInfo; canSave: boolean; onSave: () => void; onLoad: () => void; onDelete: () => void;
}) {
  const { store } = useGame();
  const isAuto = info.slot === 'auto';
  let body;
  if (info.status === 'empty') body = <span className="muted">Empty</span>;
  else if (info.status === 'corrupt') body = <span className="warn">Corrupt save</span>;
  else {
    const s = slotSummary(info.save, store.config);
    body = (
      <span className="slot__desc">
        <ZodiacGlyph sign={s.birthSign} height={36} />
        <span>
          <strong>{s.name}</strong> · {s.date} · {s.where}
          <br />
          <span className="muted">Saved {new Date(info.save.savedAt).toLocaleString()}
            {!info.compatible && <span className="warn"> · different rules</span>}</span>
        </span>
      </span>
    );
  }
  return (
    <li className="slot">
      <span className="slot__name">{SLOT_LABEL[info.slot]}</span>
      {body}
      <span className="slot__actions">
        {!isAuto && canSave && <Button onClick={onSave}>Save</Button>}
        {info.status === 'ok' && <Button onClick={onLoad}>Load</Button>}
        {info.status !== 'empty' && <Button onClick={onDelete}>Delete</Button>}
      </span>
    </li>
  );
}

export function SaveLoadOverlay() {
  const { store, snap } = useGame();
  const [confirm, setConfirm] = useState<{ kind: 'load' | 'delete' | 'overwrite'; slot: SlotId } | null>(null);
  const slots = store.slots();
  const inGame = snap.ui.menu === 'game' && snap.state !== null;
  const canSave = inGame && snap.ui.pendingResult === undefined;
  const load = (slot: SlotId) => { store.load(slot); };
  const info = (slot: SlotId) => slots.find((s) => s.slot === slot)!;
  if (confirm !== null) {
    const text = {
      load: 'These rules changed since this save was made. Load it anyway?',
      delete: `Delete ${SLOT_LABEL[confirm.slot]}? This cannot be undone.`,
      overwrite: `Overwrite ${SLOT_LABEL[confirm.slot]}?`,
    }[confirm.kind];
    const go = () => {
      if (confirm.kind === 'load') load(confirm.slot);
      else if (confirm.kind === 'delete') store.deleteSlot(confirm.slot);
      else store.save(confirm.slot);
      setConfirm(null);
    };
    return (
      <Modal key="confirmation" title="Are you sure?" actions={<><Button onClick={() => setConfirm(null)}>Cancel</Button><Button primary onClick={go}>Yes</Button></>}>
        <p>{text}</p>
      </Modal>
    );
  }
  return (
    <Modal key="slots" className="saveload" title={inGame ? 'Save / Load' : 'Load'} actions={<>
      {inGame && <Button onClick={() => store.quitToTitle()}>Quit to title</Button>}
      <Button primary onClick={() => store.closeOverlay()}>Close</Button>
    </>}>
      {slots.length === 0 ? <p className="warn">This browser blocks local storage, so saving is unavailable.</p> : (
        <ul className="slots">
          {slots.map((s) => (
            <SlotRow key={s.slot} info={s} canSave={canSave}
              onSave={() => (info(s.slot).status === 'empty' ? store.save(s.slot) : setConfirm({ kind: 'overwrite', slot: s.slot }))}
              onLoad={() => (s.status === 'ok' && !s.compatible ? setConfirm({ kind: 'load', slot: s.slot }) : load(s.slot))}
              onDelete={() => setConfirm({ kind: 'delete', slot: s.slot })} />
          ))}
        </ul>
      )}
      {inGame && <p className="muted" style={{ marginTop: 8 }}>The game autosaves after every action.</p>}
    </Modal>
  );
}

export function CreditsOverlay() {
  const { store } = useGame();
  return (
    <Modal title="Credits" actions={<Button primary onClick={() => store.closeOverlay()}>Close</Button>}>
      <ul className="credits">
        <li>Interface: Kenney RPG UI pack (CC0), kenney.nl</li>
        <li>Fonts: IM Fell English (Igino Marini, OFL), Canterbury and Carrick Caps (1001fonts licences)</li>
        <li>Paintings, woodcuts and portraits: public-domain works; per-image sources to follow</li>
        <li>Credits screen content is a placeholder until provenance is recorded (docs/archive/ui-technical-plan.md §11).</li>
      </ul>
    </Modal>
  );
}

/** `?dev` drawer: seed, config, raw state, and an obviously-not-a-game-action Coin cheat. */
export function DevPanel({ configId, onConfig }: { configId: ConfigId; onConfig: (id: ConfigId) => void }) {
  const { store, snap } = useGame();
  const [open, setOpen] = useState(false);
  const [dump, setDump] = useState<string | null>(null);
  if (!open) return <button type="button" className="dev-toggle" onClick={() => setOpen(true)}>dev</button>;
  const state = snap.state;
  const give = (s: CampaignState) => store.devReplaceState({ ...s, treasury: s.treasury + 100 });
  return (
    <aside className="dev">
      <div className="dev__row"><strong>Dev panel</strong><button type="button" onClick={() => setOpen(false)}>×</button></div>
      <label className="dev__row">Seed for New Game
        <input type="number" value={snap.ui.devSeed ?? ''} placeholder="random"
          onChange={(e) => store.setUi({ devSeed: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </label>
      <label className="dev__row">Rules
        <select value={configId} onChange={(e) => onConfig(e.target.value as ConfigId)}>
          {Object.keys(CONFIG_LOADERS).map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <p className="dev__note">Switching rules returns to the title; saves from other rules show as incompatible.</p>
      <div className="dev__row">
        <button type="button" disabled={state === null} onClick={() => setDump(JSON.stringify(state, null, 2))}>State JSON</button>
        <button type="button" onClick={() => setDump(JSON.stringify(snap.lastEvents, null, 2))}>Last events</button>
        <button type="button" disabled={state === null} onClick={() => state !== null && give(state)}>+100 Coin (cheat)</button>
      </div>
      {state !== null && <p className="dev__note">seed {state.seed} · week {state.elapsedWeeks} · {state.phase}{state.pilgrimage ? ` / ${state.pilgrimage.stage}` : ''}</p>}
      {dump !== null && <textarea className="dev__dump" readOnly value={dump} onFocus={(e) => e.currentTarget.select()} />}
    </aside>
  );
}
