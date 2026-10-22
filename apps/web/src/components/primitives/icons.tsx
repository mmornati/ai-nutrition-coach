import type { ReactNode } from 'react';

/**
 * Authored inline icons. One stroke weight (2), round caps and round joins, like a running stitch.
 * Icons are decorative: the control that holds one always carries the accessible name.
 */
export interface IconProps {
  /** Pixel size; defaults to 22. */
  readonly size?: number;
  readonly className?: string;
}

function Icon({ size = 22, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Icon>
);

export const BarcodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M20 5v14" />
  </Icon>
);

export const TypeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h10M4 17h13" />
  </Icon>
);

// Cog outline after Lucide's "settings" (ISC licence).
export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 11h14v9H5z" />
    <path d="M8 11V7l2-2h4l2 2v4" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12l5 5 9-10" />
  </Icon>
);

/** Rail navigation: the day (four lines) and the week (two tracks). */
export const TodayIcon = (p: IconProps) => (
  <Icon {...p}>
    {/* One towel, three stripes: the day. */}
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M5 9h14M5 12.5h14M5 16h14" />
  </Icon>
);

export const WeekIcon = (p: IconProps) => (
  <Icon {...p}>
    {/* Towels hung side by side on a line: the week. */}
    <path d="M2 4h20" />
    <rect x="3.5" y="4" width="4.5" height="14" rx="1" />
    <rect x="9.75" y="4" width="4.5" height="16" rx="1" />
    <rect x="16" y="4" width="4.5" height="12" rx="1" />
  </Icon>
);

export const TorchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </Icon>
);

export const ICONS = {
  camera: CameraIcon,
  barcode: BarcodeIcon,
  type: TypeIcon,
  gear: GearIcon,
  close: CloseIcon,
  back: BackIcon,
  chevron: ChevronIcon,
  plus: PlusIcon,
  lock: LockIcon,
  check: CheckIcon,
  today: TodayIcon,
  week: WeekIcon,
  torch: TorchIcon,
} as const;
