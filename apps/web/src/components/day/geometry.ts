/**
 * CSS grid template for the week network's label rows: a zero-height row at each line's y, with
 * `pad` fractions above the first line and below the last and `gap` between lines. Plain CSS
 * (never copy), so it lives outside the `.tsx` files the i18n gate reads.
 */
export function labelRowTemplate(lines: number, pad: number, gap: number): string {
  const rows = Array.from({ length: lines }, (_, j) =>
    j < lines - 1 ? `0px minmax(0,${gap}fr)` : '0px',
  );
  return `minmax(0,${pad}fr) ${rows.join(' ')} minmax(0,${pad}fr)`;
}
