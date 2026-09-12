// Inline logo mark: strokes use currentColor, so the parent text color
// (text-ink / text-ink-faint) controls the ink; accent stays terracotta.
export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* open book */}
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 22c-4.5-3.4-10.2-4.4-17-3.2v22.4c6.8-1.2 12.5-.2 17 3.2" />
        <path d="M32 22c4.5-3.4 10.2-4.4 17-3.2v22.4c-6.8-1.2-12.5-.2-17 3.2" />
        <path d="M32 22v22.4" />
      </g>
      {/* pages turning into graph edges */}
      <g stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M38 18.5 44 13" />
        <path d="M42 20.5 51 19" />
        <path d="M46 25.5 53 30" />
      </g>
      {/* graph nodes */}
      <circle cx="46.5" cy="10.5" r="3.2" fill="var(--accent)" />
      <circle cx="55" cy="18" r="3.2" fill="currentColor" />
      <circle cx="56.5" cy="33" r="3.2" fill="var(--accent)" />
    </svg>
  );
}
