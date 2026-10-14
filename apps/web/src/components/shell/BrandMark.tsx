/** The four lines meeting at an interchange. Decorative; the wordmark beside it names the app. */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" focusable="false">
      <path d="M6 2v10l8 8v8" className="stroke-line-veg" strokeWidth="4" fill="none" />
      <path d="M14 2v26" className="stroke-line-protein" strokeWidth="4" fill="none" />
      <path d="M22 2v10l-8 8" className="stroke-line-starch" strokeWidth="4" fill="none" />
      <path d="M26 2v26" className="stroke-line-dairy" strokeWidth="4" fill="none" />
      <circle cx="14" cy="20" r="5" className="fill-enamel stroke-porcelain" strokeWidth="3" />
    </svg>
  );
}
