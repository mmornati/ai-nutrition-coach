// `StoreDbOps` in plain process memory. UNENCRYPTED: it exists for the dev-only store (behind an
// explicit dev flag, with a visible banner) and as the reference the contract suite compares the
// SQL implementation with. It must never be reachable from a production bundle (see
// create-store.ts and tools/check_no_dev_store_in_build.sh).

import type {
  EntryInsert,
  EntryRow,
  InsertedPlate,
  NoteInsert,
  NoteRow,
  PlateRow,
  PlateRowSet,
  StoreDbOps,
} from './ops';

export class MemoryStoreDb implements StoreDbOps {
  private plates: PlateRow[] = [];
  private entries: EntryRow[] = [];
  private notes: NoteRow[] = [];
  private interactions: { id: number; coachNoteId: number; kind: string; at: string }[] = [];
  private dismissals = new Map<string, { id: number; at: string }>();
  private kv = new Map<string, string>();
  private nextId = { plate: 1, entry: 1, note: 1, interaction: 1, dismissal: 1 };

  insertPlate(loggedAtUtc: string, entries: readonly EntryInsert[]): InsertedPlate {
    const plateId = this.nextId.plate++;
    this.plates.push({ id: plateId, loggedAtUtc });
    const entryIds: number[] = [];
    for (const e of entries) {
      const id = this.nextId.entry++;
      this.entries.push({ ...e, id, plateLogId: plateId });
      entryIds.push(id);
    }
    return { plateId, entryIds };
  }

  readPlateRows(fromUtc: string | null, toUtc: string | null): PlateRowSet {
    const plates = this.plates
      .filter(
        (p) =>
          (fromUtc === null || p.loggedAtUtc >= fromUtc) &&
          (toUtc === null || p.loggedAtUtc < toUtc),
      )
      .sort((a, b) =>
        a.loggedAtUtc === b.loggedAtUtc ? b.id - a.id : a.loggedAtUtc < b.loggedAtUtc ? 1 : -1,
      );
    const ids = new Set(plates.map((p) => p.id));
    const entries = this.entries.filter((e) => ids.has(e.plateLogId)).sort((a, b) => a.id - b.id);
    return { plates, entries };
  }

  deletePlate(plateLogId: number): void {
    this.deleteNotesForPlate(plateLogId);
    this.entries = this.entries.filter((e) => e.plateLogId !== plateLogId);
    this.plates = this.plates.filter((p) => p.id !== plateLogId);
  }

  insertNote(note: NoteInsert): number {
    const id = this.nextId.note++;
    this.notes.push({ ...note, id });
    return id;
  }

  notesForPlate(plateLogId: number): NoteRow[] {
    return this.notes.filter((n) => n.plateLogId === plateLogId).sort((a, b) => a.id - b.id);
  }

  insertDismissal(key: string, atUtc: string): number {
    const existing = this.dismissals.get(key);
    if (existing) return existing.id;
    const id = this.nextId.dismissal++;
    this.dismissals.set(key, { id, at: atUtc });
    return id;
  }

  dismissalKeys(): string[] {
    return [...this.dismissals.keys()];
  }

  pruneOpenPlateDismissals(cutoffDay: string): void {
    for (const key of [...this.dismissals.keys()]) {
      if (key.startsWith('openPlate:') && key.slice(10, 20) < cutoffDay)
        this.dismissals.delete(key);
    }
  }

  insertInteraction(coachNoteId: number, kind: string, at: string): number {
    const id = this.nextId.interaction++;
    this.interactions.push({ id, coachNoteId, kind, at });
    return id;
  }

  deleteNotesForPlate(plateLogId: number): void {
    const noteIds = new Set(this.notes.filter((n) => n.plateLogId === plateLogId).map((n) => n.id));
    this.interactions = this.interactions.filter((i) => !noteIds.has(i.coachNoteId));
    for (const id of noteIds) this.dismissals.delete(`note:${id}`);
    this.notes = this.notes.filter((n) => n.plateLogId !== plateLogId);
  }

  kvGet(key: string): string | null {
    return this.kv.get(key) ?? null;
  }

  kvSet(key: string, value: string): void {
    this.kv.set(key, value);
  }

  kvDelete(key: string): void {
    this.kv.delete(key);
  }
}
