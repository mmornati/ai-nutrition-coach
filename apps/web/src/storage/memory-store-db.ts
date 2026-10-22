// `StoreDbOps` in plain process memory. UNENCRYPTED: it exists for the dev-only store (behind an
// explicit dev flag, with a visible banner) and as the reference the contract suite compares the
// SQL implementation with. It must never be reachable from a production bundle (see
// create-store.ts and tools/check_no_dev_store_in_build.sh).

import {
  canonicalizeSnapshot,
  canonicalText,
  compareHlc,
  isSyncedKvKey,
  KV_UID_PREFIX,
  kvTombstoneUid,
  newestHlc,
  pickStamped,
  SNAPSHOT_VERSION,
  snapshotBeyond,
  survivesTombstone,
  tombstoneKey,
  vaultConflict,
  ZERO_HLC,
  type TombstoneTable,
  type VaultCoachNote,
  type VaultEntry,
  type VaultPlate,
  type VaultRecipe,
  type VaultSavedMeal,
  type VaultSnapshot,
} from '@anc/core';
import { SCHEMA_VERSION } from './constants';
import type {
  EntryInsert,
  EntryRow,
  InsertedPlate,
  NoteInsert,
  NoteRow,
  PlateRow,
  PlateRowSet,
  RecipeRow,
  RecipeSet,
  SavedItemRow,
  SavedMealRow,
  SavedMealSet,
  StoreDbOps,
} from './ops';
import {
  DEVICE_ID_KV_KEY,
  systemVaultEnv,
  VaultClock,
  type VaultApplyOutcome,
  type VaultEnv,
} from './vault-clock';
import {
  dismissalKeyFromVault,
  dismissalKeyToVault,
  fromVaultFood,
  toVaultFood,
} from './vault-mapping';

/** The uid of every row, by local id, per table: identity lives beside the rows, not in them. */
interface Uids {
  plate: Map<number, string>;
  entry: Map<number, string>;
  note: Map<number, string>;
  interaction: Map<number, string>;
  savedMeal: Map<number, string>;
  savedItem: Map<number, string>;
  recipe: Map<number, string>;
  recipeItem: Map<number, string>;
}

/** The reference for `SqliteStoreDb`: the same rows, uids, stamps and tombstones, in plain memory. */
export class MemoryStoreDb implements StoreDbOps {
  private readonly clock: VaultClock;
  private readonly uids: Uids = {
    plate: new Map(),
    entry: new Map(),
    note: new Map(),
    interaction: new Map(),
    savedMeal: new Map(),
    savedItem: new Map(),
    recipe: new Map(),
    recipeItem: new Map(),
  };
  /** Change stamps of saved meals / recipes (by id) and kv entries (by key). */
  private readonly mealStamps = new Map<number, string>();
  private readonly recipeStamps = new Map<number, string>();
  private readonly kvStamps = new Map<string, string>();
  /** Keyed by table and uid (`tombstoneKey`). */
  private readonly tombstones = new Map<
    string,
    { uid: string; table: TombstoneTable; at: string }
  >();

  private plates: PlateRow[] = [];
  private entries: EntryRow[] = [];
  private notes: NoteRow[] = [];
  private interactions: { id: number; coachNoteId: number; kind: string; at: string }[] = [];
  private dismissals = new Map<string, { id: number; at: string }>();
  private kv = new Map<string, string>();
  private savedMeals: SavedMealRow[] = [];
  private savedMealItems: SavedItemRow[] = [];
  private recipes: RecipeRow[] = [];
  private recipeItems: SavedItemRow[] = [];
  private readonly nextId = {
    plate: 1,
    entry: 1,
    note: 1,
    interaction: 1,
    dismissal: 1,
    savedMeal: 1,
    savedItem: 1,
    recipe: 1,
    recipeItem: 1,
  };

  constructor(env: VaultEnv = systemVaultEnv) {
    this.clock = new VaultClock(env, {
      readDeviceId: () => this.kv.get(DEVICE_ID_KV_KEY) ?? null,
      writeDeviceId: (id) => void this.kv.set(DEVICE_ID_KV_KEY, id),
      newestUid: () => {
        let newest: string | null = null;
        for (const map of Object.values(this.uids)) {
          for (const uid of map.values()) if (newest === null || uid > newest) newest = uid;
        }
        return newest;
      },
      newestStamp: () => {
        let newest: string | null = null;
        for (const stamp of [
          ...this.mealStamps.values(),
          ...this.recipeStamps.values(),
          ...this.kvStamps.values(),
          ...[...this.tombstones.values()].map((t) => t.at),
        ]) {
          if (newest === null || compareHlc(stamp, newest) > 0) newest = stamp;
        }
        return newest;
      },
    });
    this.clock.ensureDevice();
  }

  private tombstone(uid: string | undefined, table: TombstoneTable, at: string): void {
    if (uid === undefined) return;
    const key = tombstoneKey(table, uid);
    const existing = this.tombstones.get(key);
    if (existing === undefined || compareHlc(at, existing.at) > 0) {
      this.tombstones.set(key, { uid, table, at });
    }
  }

  insertPlate(loggedAtUtc: string, entries: readonly EntryInsert[]): InsertedPlate {
    const plateId = this.nextId.plate++;
    this.plates.push({ id: plateId, loggedAtUtc });
    this.uids.plate.set(plateId, this.clock.newUid());
    const entryIds: number[] = [];
    for (const e of entries) {
      const id = this.nextId.entry++;
      this.entries.push({ ...e, id, plateLogId: plateId });
      this.uids.entry.set(id, this.clock.newUid());
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
    if (!this.plates.some((p) => p.id === plateLogId)) return;
    const at = this.clock.stamp();
    for (const e of this.entries) {
      if (e.plateLogId === plateLogId) this.tombstone(this.uids.entry.get(e.id), 'food_entry', at);
    }
    this.deleteNotes(plateLogId, at);
    this.tombstone(this.uids.plate.get(plateLogId), 'plate_log', at);
    this.entries = this.entries.filter((e) => e.plateLogId !== plateLogId);
    this.plates = this.plates.filter((p) => p.id !== plateLogId);
  }

  insertNote(note: NoteInsert): number {
    const id = this.nextId.note++;
    this.notes.push({ ...note, id });
    this.uids.note.set(id, this.clock.newUid());
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
    this.uids.interaction.set(id, this.clock.newUid());
    return id;
  }

  deleteNotesForPlate(plateLogId: number): void {
    this.deleteNotes(plateLogId, this.clock.stamp());
  }

  private deleteNotes(plateLogId: number, at: string): void {
    const noteIds = new Set(this.notes.filter((n) => n.plateLogId === plateLogId).map((n) => n.id));
    for (const i of this.interactions) {
      if (noteIds.has(i.coachNoteId)) {
        this.tombstone(this.uids.interaction.get(i.id), 'coach_interaction', at);
      }
    }
    for (const id of noteIds) this.tombstone(this.uids.note.get(id), 'coach_note', at);
    this.interactions = this.interactions.filter((i) => !noteIds.has(i.coachNoteId));
    for (const id of noteIds) this.dismissals.delete(`note:${id}`);
    this.notes = this.notes.filter((n) => n.plateLogId !== plateLogId);
  }

  insertSavedMeal(name: string, createdAtUtc: string, items: readonly EntryInsert[]): number {
    const id = this.nextId.savedMeal++;
    this.savedMeals.push({ id, name, createdAtUtc });
    this.uids.savedMeal.set(id, this.clock.newUid());
    this.mealStamps.set(id, this.clock.stamp());
    for (const e of items) {
      const itemId = this.nextId.savedItem++;
      this.savedMealItems.push({ ...e, id: itemId, parentId: id });
      this.uids.savedItem.set(itemId, this.clock.newUid());
    }
    return id;
  }

  readSavedMeals(): SavedMealSet {
    return {
      meals: [...this.savedMeals].sort((a, b) => b.id - a.id),
      items: [...this.savedMealItems].sort((a, b) => a.parentId - b.parentId || a.id - b.id),
    };
  }

  renameSavedMeal(id: number, name: string): void {
    this.savedMeals = this.savedMeals.map((m) => (m.id === id ? { ...m, name } : m));
    this.mealStamps.set(id, this.clock.stamp());
  }

  deleteSavedMeal(id: number): void {
    if (!this.savedMeals.some((m) => m.id === id)) return;
    const at = this.clock.stamp();
    for (const i of this.savedMealItems) {
      if (i.parentId === id) this.tombstone(this.uids.savedItem.get(i.id), 'saved_meal_item', at);
    }
    this.tombstone(this.uids.savedMeal.get(id), 'saved_meal', at);
    this.savedMealItems = this.savedMealItems.filter((i) => i.parentId !== id);
    this.savedMeals = this.savedMeals.filter((m) => m.id !== id);
  }

  insertRecipe(
    name: string,
    servings: number,
    cookedWeightGrams: string | null,
    createdAtUtc: string,
    items: readonly EntryInsert[],
  ): number {
    const id = this.nextId.recipe++;
    this.recipes.push({ id, name, servings, cookedWeightGrams, createdAtUtc });
    this.uids.recipe.set(id, this.clock.newUid());
    this.recipeStamps.set(id, this.clock.stamp());
    for (const e of items) {
      const itemId = this.nextId.recipeItem++;
      this.recipeItems.push({ ...e, id: itemId, parentId: id });
      this.uids.recipeItem.set(itemId, this.clock.newUid());
    }
    return id;
  }

  readRecipes(): RecipeSet {
    return {
      recipes: [...this.recipes].sort((a, b) => b.id - a.id),
      items: [...this.recipeItems].sort((a, b) => a.parentId - b.parentId || a.id - b.id),
    };
  }

  deleteRecipe(id: number): void {
    if (!this.recipes.some((r) => r.id === id)) return;
    const at = this.clock.stamp();
    for (const i of this.recipeItems) {
      if (i.parentId === id) this.tombstone(this.uids.recipeItem.get(i.id), 'recipe_item', at);
    }
    this.tombstone(this.uids.recipe.get(id), 'recipe', at);
    this.recipeItems = this.recipeItems.filter((i) => i.parentId !== id);
    this.recipes = this.recipes.filter((r) => r.id !== id);
  }

  kvGet(key: string): string | null {
    return this.kv.get(key) ?? null;
  }

  kvSet(key: string, value: string): void {
    this.kv.set(key, value);
    this.kvStamps.set(key, this.clock.stamp());
  }

  kvDelete(key: string): void {
    if (isSyncedKvKey(key) && this.kv.has(key)) {
      this.tombstone(kvTombstoneUid(key), 'kv', this.clock.stamp());
    }
    this.kv.delete(key);
    this.kvStamps.delete(key);
  }

  readVault(): VaultSnapshot {
    const food = (e: EntryInsert) => toVaultFood(e);
    const noteUidById = new Map(
      this.notes.map((n) => [n.id, this.uids.note.get(n.id) ?? ''] as const),
    );
    const byId = <T extends { id: number }>(rows: readonly T[]): T[] =>
      [...rows].sort((a, b) => a.id - b.id);
    const items = (rows: readonly SavedItemRow[], uids: Map<number, string>, parent: number) =>
      byId(rows.filter((i) => i.parentId === parent)).map((i): VaultEntry => ({
        uid: uids.get(i.id) ?? '',
        ...food(i),
      }));

    const plates = this.plates.map((p): VaultPlate => ({
      uid: this.uids.plate.get(p.id) ?? '',
      loggedAtUtc: p.loggedAtUtc,
      entries: byId(this.entries.filter((e) => e.plateLogId === p.id)).map((e): VaultEntry => ({
        uid: this.uids.entry.get(e.id) ?? '',
        ...food(e),
      })),
      notes: byId(this.notes.filter((n) => n.plateLogId === p.id)).map((n): VaultCoachNote => ({
        uid: this.uids.note.get(n.id) ?? '',
        anchor: n.anchor,
        questionKey: n.questionKey,
        noteText: n.noteText,
        generatedAt: n.generatedAt,
        interactions: byId(this.interactions.filter((i) => i.coachNoteId === n.id)).map((i) => ({
          uid: this.uids.interaction.get(i.id) ?? '',
          kind: i.kind,
          at: i.at,
        })),
      })),
    }));
    const dismissals = [...this.dismissals].flatMap(([key, d]) => {
      const mapped = dismissalKeyToVault(key, noteUidById);
      return mapped === null ? [] : [{ key: mapped, dismissedAtUtc: d.at }];
    });
    const savedMeals = this.savedMeals.map((m): VaultSavedMeal => ({
      uid: this.uids.savedMeal.get(m.id) ?? '',
      name: m.name,
      createdAtUtc: m.createdAtUtc,
      updatedAtHlc: this.mealStamps.get(m.id) ?? ZERO_HLC,
      items: items(this.savedMealItems, this.uids.savedItem, m.id),
    }));
    const recipes = this.recipes.map((r): VaultRecipe => ({
      uid: this.uids.recipe.get(r.id) ?? '',
      name: r.name,
      servings: r.servings,
      cookedWeightGrams: r.cookedWeightGrams,
      createdAtUtc: r.createdAtUtc,
      updatedAtHlc: this.recipeStamps.get(r.id) ?? ZERO_HLC,
      items: items(this.recipeItems, this.uids.recipeItem, r.id),
    }));
    const kv = [...this.kv]
      .filter(([key]) => isSyncedKvKey(key))
      .map(([key, value]) => ({ key, value, updatedAtHlc: this.kvStamps.get(key) ?? ZERO_HLC }));
    const tombstones = [...this.tombstones.values()]
      // A deleted device-only key is not something to tell another device about either.
      .filter(
        (t) =>
          t.table !== 'kv' ||
          (t.uid.startsWith(KV_UID_PREFIX) && isSyncedKvKey(t.uid.slice(KV_UID_PREFIX.length))),
      )
      .map((t) => ({ uid: t.uid, table: t.table, deletedAtHlc: t.at }));
    return canonicalizeSnapshot({
      snapshotVersion: SNAPSHOT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      plates,
      dismissals,
      savedMeals,
      recipes,
      kv,
      tombstones,
    });
  }

  applyVault(snapshot: VaultSnapshot): VaultApplyOutcome {
    // Same checks, same order, same decisions as the SQL store (and as the pure merge).
    if (snapshotBeyond(snapshot, this.clock.wallLimitMs())) return 'clockAhead';
    const before = this.readVault();
    if (vaultConflict(before, snapshot)) return 'conflict';
    const meals = new Map(before.savedMeals.map((m) => [m.uid, m] as const));
    const recipes = new Map(before.recipes.map((r) => [r.uid, r] as const));
    const entries = new Map(before.kv.map((e) => [e.key, e] as const));

    // Only rows that are still stored count (a deleted row's uid is remembered in `uids`).
    const idOf = (
      uids: Map<number, string>,
      uid: string,
      rows: readonly { readonly id: number }[],
    ): number | null => {
      for (const row of rows) if (uids.get(row.id) === uid) return row.id;
      return null;
    };
    const deletedAt = (table: TombstoneTable, uid: string): string | null =>
      this.tombstones.get(tombstoneKey(table, uid))?.at ?? null;
    const incomingWins = <T extends { readonly updatedAtHlc: string }>(
      incoming: T,
      stored: T | undefined,
      at: string | null,
    ): boolean => {
      if (!survivesTombstone(incoming.updatedAtHlc, at)) return false;
      if (stored === undefined || !survivesTombstone(stored.updatedAtHlc, at)) return true;
      return canonicalText(pickStamped(stored, incoming)) !== canonicalText(stored);
    };
    const removeNote = (id: number): void => {
      this.interactions = this.interactions.filter((i) => i.coachNoteId !== id);
      this.dismissals.delete(`note:${id}`);
      this.notes = this.notes.filter((n) => n.id !== id);
    };

    for (const t of snapshot.tombstones) {
      this.tombstone(t.uid, t.table, t.deletedAtHlc);
      switch (t.table) {
        case 'plate_log': {
          const id = idOf(this.uids.plate, t.uid, this.plates);
          if (id === null) break;
          for (const n of this.notes.filter((x) => x.plateLogId === id)) removeNote(n.id);
          this.entries = this.entries.filter((e) => e.plateLogId !== id);
          this.plates = this.plates.filter((p) => p.id !== id);
          break;
        }
        case 'food_entry': {
          const id = idOf(this.uids.entry, t.uid, this.entries);
          this.entries = this.entries.filter((e) => e.id !== id);
          break;
        }
        case 'coach_note': {
          const id = idOf(this.uids.note, t.uid, this.notes);
          if (id !== null) removeNote(id);
          break;
        }
        case 'coach_interaction': {
          const id = idOf(this.uids.interaction, t.uid, this.interactions);
          this.interactions = this.interactions.filter((i) => i.id !== id);
          break;
        }
        case 'saved_meal': {
          const id = idOf(this.uids.savedMeal, t.uid, this.savedMeals);
          if (
            id === null ||
            survivesTombstone(this.mealStamps.get(id) ?? ZERO_HLC, t.deletedAtHlc)
          ) {
            break;
          }
          this.savedMealItems = this.savedMealItems.filter((i) => i.parentId !== id);
          this.savedMeals = this.savedMeals.filter((m) => m.id !== id);
          break;
        }
        case 'recipe': {
          const id = idOf(this.uids.recipe, t.uid, this.recipes);
          if (
            id === null ||
            survivesTombstone(this.recipeStamps.get(id) ?? ZERO_HLC, t.deletedAtHlc)
          ) {
            break;
          }
          this.recipeItems = this.recipeItems.filter((i) => i.parentId !== id);
          this.recipes = this.recipes.filter((r) => r.id !== id);
          break;
        }
        case 'kv': {
          if (!t.uid.startsWith(KV_UID_PREFIX)) break;
          const key = t.uid.slice(KV_UID_PREFIX.length);
          if (
            this.kv.has(key) &&
            !survivesTombstone(this.kvStamps.get(key) ?? ZERO_HLC, t.deletedAtHlc)
          ) {
            this.kv.delete(key);
            this.kvStamps.delete(key);
          }
          break;
        }
        case 'saved_meal_item':
        case 'recipe_item':
          break;
      }
    }

    for (const plate of snapshot.plates) {
      if (deletedAt('plate_log', plate.uid) !== null) continue;
      let plateId = idOf(this.uids.plate, plate.uid, this.plates);
      if (plateId === null) {
        plateId = this.nextId.plate++;
        this.plates.push({ id: plateId, loggedAtUtc: plate.loggedAtUtc });
        this.uids.plate.set(plateId, plate.uid);
      }
      for (const entry of plate.entries) {
        if (
          deletedAt('food_entry', entry.uid) !== null ||
          idOf(this.uids.entry, entry.uid, this.entries) !== null
        ) {
          continue;
        }
        const id = this.nextId.entry++;
        this.entries.push({ ...fromVaultFood(entry), id, plateLogId: plateId });
        this.uids.entry.set(id, entry.uid);
      }
      for (const note of plate.notes) {
        if (deletedAt('coach_note', note.uid) !== null) continue;
        let noteId = idOf(this.uids.note, note.uid, this.notes);
        if (noteId === null) {
          noteId = this.nextId.note++;
          this.notes.push({
            id: noteId,
            plateLogId: plateId,
            anchor: note.anchor,
            questionKey: note.questionKey,
            noteText: note.noteText,
            generatedAt: note.generatedAt,
          });
          this.uids.note.set(noteId, note.uid);
        }
        for (const interaction of note.interactions) {
          if (
            deletedAt('coach_interaction', interaction.uid) !== null ||
            idOf(this.uids.interaction, interaction.uid, this.interactions) !== null
          ) {
            continue;
          }
          const id = this.nextId.interaction++;
          this.interactions.push({
            id,
            coachNoteId: noteId,
            kind: interaction.kind,
            at: interaction.at,
          });
          this.uids.interaction.set(id, interaction.uid);
        }
      }
    }

    const noteIdByUid = new Map(
      this.notes.map((n) => [this.uids.note.get(n.id) ?? '', n.id] as const),
    );
    for (const d of snapshot.dismissals) {
      const key = dismissalKeyFromVault(d.key, noteIdByUid);
      if (key === null) continue;
      const existing = this.dismissals.get(key);
      if (existing === undefined) {
        this.dismissals.set(key, { id: this.nextId.dismissal++, at: d.dismissedAtUtc });
      } else if (d.dismissedAtUtc > existing.at) {
        existing.at = d.dismissedAtUtc;
      }
    }

    for (const meal of snapshot.savedMeals) {
      if (!incomingWins(meal, meals.get(meal.uid), deletedAt('saved_meal', meal.uid))) continue;
      let id = idOf(this.uids.savedMeal, meal.uid, this.savedMeals);
      const row = { name: meal.name, createdAtUtc: meal.createdAtUtc };
      if (id === null) {
        id = this.nextId.savedMeal++;
        this.savedMeals.push({ id, ...row });
        this.uids.savedMeal.set(id, meal.uid);
      } else {
        const known = id;
        this.savedMeals = this.savedMeals.map((m) => (m.id === known ? { id: known, ...row } : m));
      }
      this.mealStamps.set(id, meal.updatedAtHlc);
      const parent = id;
      this.savedMealItems = this.savedMealItems.filter((i) => i.parentId !== parent);
      for (const item of meal.items) {
        const itemId = this.nextId.savedItem++;
        this.savedMealItems.push({ ...fromVaultFood(item), id: itemId, parentId: parent });
        this.uids.savedItem.set(itemId, item.uid);
      }
    }
    for (const recipe of snapshot.recipes) {
      if (!incomingWins(recipe, recipes.get(recipe.uid), deletedAt('recipe', recipe.uid))) continue;
      let id = idOf(this.uids.recipe, recipe.uid, this.recipes);
      const row = {
        name: recipe.name,
        servings: recipe.servings,
        cookedWeightGrams: recipe.cookedWeightGrams,
        createdAtUtc: recipe.createdAtUtc,
      };
      if (id === null) {
        id = this.nextId.recipe++;
        this.recipes.push({ id, ...row });
        this.uids.recipe.set(id, recipe.uid);
      } else {
        const known = id;
        this.recipes = this.recipes.map((r) => (r.id === known ? { id: known, ...row } : r));
      }
      this.recipeStamps.set(id, recipe.updatedAtHlc);
      const parent = id;
      this.recipeItems = this.recipeItems.filter((i) => i.parentId !== parent);
      for (const item of recipe.items) {
        const itemId = this.nextId.recipeItem++;
        this.recipeItems.push({ ...fromVaultFood(item), id: itemId, parentId: parent });
        this.uids.recipeItem.set(itemId, item.uid);
      }
    }

    for (const entry of snapshot.kv) {
      if (!isSyncedKvKey(entry.key)) continue;
      const at = deletedAt('kv', kvTombstoneUid(entry.key));
      if (!incomingWins(entry, entries.get(entry.key), at)) continue;
      this.kv.set(entry.key, entry.value);
      this.kvStamps.set(entry.key, entry.updatedAtHlc);
    }
    this.clock.observe(newestHlc(snapshot));
    return 'applied';
  }
}
