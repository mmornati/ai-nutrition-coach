/** A folded kitchen towel with the four dyed stripes. Decorative; the wordmark beside it names the app. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <rect
        x="4"
        y="2"
        width="22"
        height="26"
        rx="3"
        className="fill-raised stroke-ink"
        strokeWidth="2"
      />
      <rect x="5" y="8" width="20" height="3" className="fill-veg" />
      <rect x="5" y="12.5" width="20" height="3" className="fill-protein" />
      <rect x="5" y="17" width="20" height="3" className="fill-starch" />
      <rect x="5" y="21.5" width="20" height="3" className="fill-dairy" />
    </svg>
  );
}
