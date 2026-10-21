import { useState } from 'react';
import { cleanSavedName, copyDrafts, type PlateLog } from '@anc/core';
import { Button, TextField } from '../../components/primitives';
import { Sheet } from '../../components/sheets';
import { fill, useMessage, useStrings } from '../../i18n';
import { useDay } from '../../app/day-context';
import { useSession } from '../../app/session';
import { plateSummary } from './summary';

/** "Save as a meal": name a template of this plate's foods and amounts, to log again in a tap. */
export function SaveMealSheet({
  open,
  plate,
  onClose,
}: {
  readonly open: boolean;
  readonly plate: PlateLog;
  readonly onClose: () => void;
}) {
  const t = useStrings().relog;
  const { saved } = useSession();
  const day = useDay();
  // The foods read as a name the person can keep or replace.
  const [name, setName] = useState(() => cleanSavedName(plateSummary(plate)) ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useMessage();

  const submit = async () => {
    if (busy) return;
    const clean = cleanSavedName(name);
    if (clean === null) {
      setNote((a) => a.relog.nameNeeded);
      return;
    }
    setBusy(true);
    let ok: boolean;
    try {
      const result = await saved.saveMeal({ name: clean, entries: copyDrafts(plate.entries) });
      ok = result.kind === 'saved';
    } catch {
      ok = false;
    }
    setBusy(false);
    if (!ok) {
      setNote((a) => a.common.logFailed);
      return;
    }
    day.setNotice((a) => fill(a.relog.mealSaved, { name: clean }));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t.saveMeal}>
      <p className="text-body-small text-porcelain-dim">{t.saveMealIntro}</p>
      <TextField
        label={t.mealName}
        value={name}
        autoComplete="off"
        data-autofocus
        onChange={(e) => {
          setNote(null);
          setName(e.target.value);
        }}
      />
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {note}
      </p>
      <Button fullWidth busy={busy} onClick={() => void submit()}>
        {t.saveMealConfirm}
      </Button>
    </Sheet>
  );
}
