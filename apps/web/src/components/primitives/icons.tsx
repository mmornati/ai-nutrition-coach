import type { ReactNode } from 'react';

/**
 * Authored inline icons. One stroke weight (2), square caps and mitred joins, straight lines that
 * bend at 45 or 90 degrees only (DESIGN.md, the 45/90 Rule). Icons are decorative: the control
 * that holds one always carries the accessible name.
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
      strokeLinecap="square"
      strokeLinejoin="miter"
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

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h6l6 6v6l-6 6H9l-6-6V9z" />
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
    <path d="M6 3v18M12 3v18M18 3v18" />
  </Icon>
);

export const WeekIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8h18M3 16h18" />
    <circle cx="7" cy="8" r="2" />
    <circle cx="17" cy="16" r="2" />
  </Icon>
);

export const TorchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </Icon>
);

/** A speech bubble: "Describe" (say or write what was on the plate). */
export const DescribeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16v11h-9l-4 4v-4H4z" />
    <path d="M8 9h8M8 12h5" />
  </Icon>
);

/** A microphone, drawn with 45/90 degree lines only. */
export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3h6v9l-1.5 1.5h-3L9 12z" />
    <path d="M6 10v3l3 3h6l3-3v-3M12 16v5M9 21h6" />
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
  describe: DescribeIcon,
  mic: MicIcon,
} as const;
