import { useState, type ReactNode } from 'react';
import type {
  DatabaseFood,
  FoodEntryDraft,
  FoodMatch,
  QuantityRange,
  RecognitionResult,
} from '@anc/core';
import { DayGallerySection } from './DayGallerySection';
import { StatusChip } from '../day';
import { ConfirmDialog } from '../dialogs/ConfirmDialog';
import { EraseLocalDataDialog } from '../dialogs/EraseLocalDataDialog';
import { OffLookupNotice } from '../dialogs/OffLookupNotice';
import { PhotoConsentDialog } from '../dialogs/PhotoConsentDialog';
import { RemovePlateDialog } from '../dialogs/RemovePlateDialog';
import {
  Button,
  GroupMarker,
  ICONS,
  IconButton,
  GearIcon,
  TextField,
  Checkbox,
  VersionTag,
  type ButtonVariant,
} from '../primitives';
import {
  BarcodeMatchSheet,
  CaptureSheet,
  EntryList,
  LineBar,
  PortionPresets,
  RecognizedMatchSheet,
} from '../sheets';
import {
  AppShell,
  DepartureBoard,
  Header,
  LockButton,
  TierRadio,
  UpdateBanner,
  UpdatePrompt,
} from '../shell';

/* Dev gallery (route: #/gallery). Every component in its states with synthetic data. */

const food = (name: string, ref: string, foodGroup: DatabaseFood['foodGroup']): DatabaseFood => ({
  sourceRef: ref,
  displayName: name,
  source: 'seed',
  foodGroup,
});
const q = (low: number, high: number, unit: string, displayLabel: string): QuantityRange => ({
  low,
  high,
  unit,
  displayLabel,
});

const FISH = food('Salmon fillet', 'seed:salmon', 'protein');
const RICE = food('Rice', 'seed:rice', 'starch');
const BROCCOLI = food('Broccoli', 'seed:broccoli', 'vegFruit');
const YOGURT = food('Plain yogurt', 'seed:yogurt', 'dairy');
const SPREAD = food('Hazelnut spread', '3017620422003', 'other');

const SERVING_PRESETS = [q(1, 1, 'serving', '~1 serving'), q(2, 2, 'serving', '~2 servings')];
const PIECE_PRESETS = [
  q(1, 2, 'piece', '~1-2 pieces'),
  q(3, 4, 'piece', '~3-4 pieces'),
  q(5, 6, 'piece', '~5-6 pieces'),
];

const BARCODE_MATCH: FoodMatch = { food: SPREAD, confidence: 1, presets: SERVING_PRESETS };
const BARCODE_MATCH_BARE: FoodMatch = { food: YOGURT, confidence: 1, presets: [] };

const RECOGNIZED: RecognitionResult = {
  kind: 'recognizedPlate',
  foods: [
    { databaseFood: FISH, confidence: 0.92, quantity: q(1, 1, 'fillet', '~1 fillet') },
    { databaseFood: RICE, confidence: 0.81, quantity: q(1, 2, 'fist', '~1-2 fists') },
    { databaseFood: BROCCOLI, confidence: 0.74, quantity: q(1, 1, 'fist', '~1 fist') },
  ],
};
const NO_MATCH: RecognitionResult = { kind: 'noMatch' };
const CLOSEST: readonly FoodMatch[] = [
  { food: YOGURT, confidence: 0.4, presets: PIECE_PRESETS },
  { food: BROCCOLI, confidence: 0.3, presets: [] },
];

const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'solid-porcelain',
  'outline-porcelain',
  'solid-enamel',
  'ghost-enamel',
];

type Overlay =
  | 'capture'
  | 'barcode'
  | 'barcodeBare'
  | 'recognized'
  | 'recognizedNone'
  | 'consent'
  | 'consentOnce'
  | 'off'
  | 'erase'
  | 'remove'
  | 'confirm';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-rule border-b-2 px-5 py-6 lg:px-7">
      <h2 className="font-display text-section text-signal-muted mb-4 uppercase">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function OnCard({ children }: { children: ReactNode }) {
  return <div className="bg-porcelain text-enamel flex flex-wrap gap-2 p-3.5">{children}</div>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Fake page content for the dock slot. */
function RouteSlot() {
  return (
    <p className="text-signal-muted flex min-h-19 items-center px-4 text-small">Week route slot</p>
  );
}

export function Gallery() {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [last, setLast] = useState('Nothing logged yet');
  const [preset, setPreset] = useState(PIECE_PRESETS[0] as QuantityRange);
  const [tier, setTier] = useState('free');
  const [ticked, setTicked] = useState(true);
  const close = () => setOverlay(null);

  const logDrafts = async (drafts: readonly FoodEntryDraft[]) => {
    await wait(400);
    setLast(
      `Logged: ${drafts.map((d) => `${d.databaseFood.displayName} ${d.quantity.displayLabel}`).join(', ')}`,
    );
    close();
  };
  const logOne = (draft: FoodEntryDraft) => logDrafts([draft]);
  const opener = (name: Overlay, label: string) => (
    <Button variant="outline-porcelain" onClick={() => setOverlay(name)}>
      {label}
    </Button>
  );

  return (
    <AppShell
      header={
        <Header
          title="Gallery"
          sub="Every component, synthetic data"
          chip={<StatusChip hasTransport={false} />}
          settingsHref="#/settings"
        />
      }
      route={<RouteSlot />}
      onLog={() => setOverlay('capture')}
      banner={<UpdatePrompt />}
    >
      <p role="status" className="px-5 pt-4 lg:px-7">
        {last}
      </p>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          {(['solid-porcelain', 'outline-porcelain'] as const).map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
          <Button disabled>Disabled</Button>
          <Button busy busyLabel="Logging…">
            Log
          </Button>
        </div>
        <OnCard>
          {BUTTON_VARIANTS.filter((v) => v.endsWith('enamel')).map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
          <Button variant="solid-enamel" disabled>
            Disabled
          </Button>
        </OnCard>
        <div className="flex flex-wrap gap-2">
          <IconButton label="Settings">
            <GearIcon />
          </IconButton>
          <IconButton label="Settings, current page" current>
            <GearIcon />
          </IconButton>
          <div className="bg-enamel-raised p-2">
            <IconButton label="Close, raised" raised>
              {ICONS.close({})}
            </IconButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip hasTransport={false} />
          <span className="font-display text-title uppercase">
            Local model
            <VersionTag spoken="coming in version 2">v2</VersionTag>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4" role="list" aria-label="Icon set">
          {Object.entries(ICONS).map(([name, Icon]) => (
            <span key={name} role="listitem" className="flex flex-col items-center gap-1 text-fine">
              <Icon size={28} />
              {name}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Fields and ticks">
        <TextField label="Custom food name" defaultValue="" />
        <TextField label="With a message" defaultValue="" message="Type a name first" />
        <Checkbox checked={ticked} onChange={(e) => setTicked(e.target.checked)}>
          Rice
        </Checkbox>
      </Section>

      <Section title="Plate detail">
        <LineBar present={['vegFruit', 'protein', 'starch']} />
        <LineBar present={[]} />
        <EntryList
          entries={[
            { id: '1', name: 'Salmon fillet', quantity: '~1 fillet', group: 'protein' },
            { id: '2', name: 'Rice', quantity: '~1-2 fists', group: 'starch' },
            { id: '3', name: 'Hazelnut spread', quantity: '~1 serving', group: 'other' },
          ]}
        />
        <GroupMarker group="dairy" />
        <PortionPresets presets={PIECE_PRESETS} value={preset} onChange={setPreset} />
      </Section>

      <Section title="Sheets">
        <div className="flex flex-wrap gap-2">
          {opener('capture', 'Open capture sheet')}
          {opener('barcode', 'Open barcode match')}
          {opener('barcodeBare', 'Open barcode match (no presets)')}
          {opener('recognized', 'Open recognized match')}
          {opener('recognizedNone', 'Open recognized match (nothing matched)')}
        </div>
      </Section>

      <Section title="Dialogs">
        <div className="flex flex-wrap gap-2">
          {opener('consent', 'Open photo consent')}
          {opener('consentOnce', 'Open photo consent (per photo)')}
          {opener('off', 'Open lookup notice')}
          {opener('erase', 'Open erase dialog')}
          {opener('remove', 'Open remove plate')}
          {opener('confirm', 'Open generic confirm')}
        </div>
      </Section>

      <Section title="Settings board">
        <DepartureBoard
          rows={[
            {
              id: 'ai',
              line: 'dairy',
              title: 'Your AI',
              subtitle: 'Reads your plate photos',
              status: 'Free quota',
              onSelect: () => setLast('Your AI'),
            },
            {
              id: 'data',
              line: 'vegFruit',
              title: 'Your data',
              subtitle: 'Export and sync',
              status: 'Local',
              onSelect: () => setLast('Your data'),
            },
          ]}
        />
        <TierRadio
          tiers={[
            {
              id: 'none',
              title: 'No AI',
              description: 'Log by barcode and typing. The coach still works.',
            },
            {
              id: 'free',
              title: 'Free quota',
              description: 'Photos read by a free hosted model with a monthly allowance.',
            },
            {
              id: 'byok',
              title: 'Your own key',
              description: 'Any OpenAI-compatible endpoint. The key stays on this device.',
            },
            {
              id: 'local',
              title: 'Local model',
              description: 'A vision model on your own hardware. Not available yet.',
              disabled: true,
            },
          ]}
          value={tier}
          onChange={setTier}
        />
      </Section>

      <Section title="Shell pieces">
        <div className="flex flex-wrap items-center gap-3">
          <LockButton unlocked onLock={() => setLast('Locked')} />
          <LockButton unlocked={false} onLock={() => undefined} />
        </div>
        <div className="border-rule border-2">
          <UpdateBanner onReload={() => undefined} onLater={() => undefined} />
        </div>
      </Section>

      <DayGallerySection />

      <CaptureSheet
        open={overlay === 'capture'}
        onClose={close}
        onSnapshot={() => setLast('Snapshot chosen')}
        onBarcode={() => setLast('Barcode chosen')}
        onType={() => setLast('Type it chosen')}
        nextMeal="Dinner"
      />
      <BarcodeMatchSheet
        open={overlay === 'barcode'}
        onClose={close}
        match={BARCODE_MATCH}
        onLog={logOne}
      />
      <BarcodeMatchSheet
        open={overlay === 'barcodeBare'}
        onClose={close}
        match={BARCODE_MATCH_BARE}
        onLog={logOne}
      />
      <RecognizedMatchSheet
        open={overlay === 'recognized'}
        onClose={close}
        result={RECOGNIZED}
        closestMatches={CLOSEST}
        onLog={logDrafts}
      />
      <RecognizedMatchSheet
        open={overlay === 'recognizedNone'}
        onClose={close}
        result={NO_MATCH}
        closestMatches={CLOSEST}
        onLog={logDrafts}
      />
      <PhotoConsentDialog
        open={overlay === 'consent'}
        host="api.example-ai.test"
        onAllow={() => {
          setLast('Allowed');
          close();
        }}
        onDecline={() => {
          setLast('Declined');
          close();
        }}
      />
      <PhotoConsentDialog
        open={overlay === 'consentOnce'}
        host="api.example-ai.test"
        perPhoto
        onAllow={() => {
          setLast('Allowed once');
          close();
        }}
        onDecline={() => {
          setLast('Declined');
          close();
        }}
      />
      <OffLookupNotice
        open={overlay === 'off'}
        onAllow={() => {
          setLast('Lookups allowed');
          close();
        }}
        onOfflineOnly={() => {
          setLast('Offline only');
          close();
        }}
      />
      <EraseLocalDataDialog
        open={overlay === 'erase'}
        onKeep={() => {
          setLast('Kept my data');
          close();
        }}
        onErase={() => {
          setLast('Erased (synthetic)');
          close();
        }}
      />
      <RemovePlateDialog
        open={overlay === 'remove'}
        dish="Rice, salmon"
        onKeep={() => {
          setLast('Kept the plate');
          close();
        }}
        onRemove={() => {
          setLast('Removed (synthetic)');
          close();
        }}
      />
      <ConfirmDialog
        open={overlay === 'confirm'}
        title="Confirm something"
        body={<p>The safe choice is the dismiss action.</p>}
        confirmLabel="Do it"
        dismissLabel="Not now"
        onConfirm={() => {
          setLast('Confirmed');
          close();
        }}
        onDismiss={() => {
          setLast('Dismissed');
          close();
        }}
      />
    </AppShell>
  );
}
