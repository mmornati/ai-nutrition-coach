import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The hem of a kitchen towel: four dyed stripes across white cotton, the app's one picture before
 * anything is logged. Decorative, so hidden from assistive tech.
 */
export function TowelDiagram() {
  return (
    <svg viewBox="0 0 360 112" aria-hidden="true" focusable="false" className="mb-8 h-auto w-full">
      <rect
        x={1}
        y={1}
        width={358}
        height={110}
        rx={6}
        className="fill-raised stroke-ink"
        strokeWidth={2}
      />
      <rect x={2} y={30} width={356} height={10} className="fill-veg" />
      <rect x={2} y={46} width={356} height={10} className="fill-protein" />
      <rect x={2} y={62} width={356} height={10} className="fill-starch" />
      <rect x={2} y={78} width={356} height={10} className="fill-dairy" />
      <path
        d="M10 10 H350 M10 102 H350"
        className="stroke-control"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        fill="none"
      />
    </svg>
  );
}

/** A single-column page for the screens that come before Today: About, create, unlock, lost. */
export function GateFrame({
  title,
  diagram = true,
  children,
}: {
  readonly title: string;
  readonly diagram?: boolean;
  readonly children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // A new page: the title is read first, and the first field comes next in the tab order.
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-110 flex-col justify-center px-6 pt-8 pb-16">
      {diagram && <TowelDiagram />}
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-display [overflow-wrap:anywhere] outline-none"
      >
        {title}
      </h1>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </main>
  );
}
