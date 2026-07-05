/**
 * Small stylized marks for the "Built on" footer strip. These are original,
 * simplified glyphs (not reproductions of each project's official logo file)
 * so there's no trademark-asset licensing question in a hackathon repo —
 * swap in official brand-kit SVGs from Circle/Arc's press pages if you want
 * the exact marks for a public submission.
 */

export function CircleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="#1AA3FF" strokeWidth="2.5" />
      <circle cx="12" cy="12" r="3" fill="#1AA3FF" />
    </svg>
  );
}

export function ArcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 18C4 10.268 8.477 5 12 5s8 5.268 8 13"
        stroke="#39ff88"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function X402Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="5" width="20" height="14" rx="3" stroke="#f5f5f5" strokeWidth="2" />
      <path d="M7 9l4 6M11 9l-4 6" stroke="#f5f5f5" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 12h6" stroke="#39ff88" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function UsdcMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#2775CA" />
      <path
        d="M13 6.5v1.2c1.6.3 2.7 1.2 2.8 2.6h-1.7c-.1-.7-.7-1.2-1.7-1.2-1 0-1.6.4-1.6 1 0 .5.4.8 1.5 1l1 .2c1.7.4 2.6 1.1 2.6 2.4 0 1.5-1.2 2.5-2.9 2.7v1.2h-1.4v-1.2c-1.7-.2-2.9-1.1-3-2.7h1.8c.1.8.7 1.3 1.8 1.3 1 0 1.7-.4 1.7-1.1 0-.6-.4-.9-1.5-1.1l-1-.2c-1.6-.3-2.5-1.1-2.5-2.4 0-1.4 1.1-2.4 2.7-2.6V6.5H13z"
        fill="#fff"
      />
    </svg>
  );
}
