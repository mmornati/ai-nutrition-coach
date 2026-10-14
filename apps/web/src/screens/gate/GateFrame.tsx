import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The four lines meeting at one interchange: the unlock diagram of the prototype
 * (docs/design/food-lines/index.html). Decorative, so hidden from assistive tech.
 */
export function LineDiagram() {
  return (
    <svg viewBox="0 0 360 120" aria-hidden="true" focusable="false" className="mb-7 h-auto w-full">
      <path d="M0 30 H120 l30 30 H360" className="stroke-line-veg" strokeWidth={8} fill="none" />
      <path d="M0 60 H360" className="stroke-line-protein" strokeWidth={8} fill="none" />
      <path
        d="M0 90 H120 l30 -30 H360"
        className="stroke-line-starch"
        strokeWidth={8}
        fill="none"
      />
      <path
        d="M0 110 H200 l20 -20 H360"
        className="stroke-line-dairy"
        strokeWidth={8}
        fill="none"
      />
      <rect
        x={128}
        y={44}
        width={44}
        height={32}
        rx={16}
        className="fill-enamel stroke-porcelain"
        strokeWidth={5}
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
      {diagram && <LineDiagram />}
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-display [overflow-wrap:anywhere] uppercase outline-none"
      >
        {title}
      </h1>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </main>
  );
}
