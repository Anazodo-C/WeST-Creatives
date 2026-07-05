/**
 * Real brand marks for the "Built on" footer strip, provided by the user and
 * placed in /public (Arc.svg, USDC.svg, circle.svg, x402.svg). Each is
 * wrapped in a small white chip so Arc's dark gradient mark and x402's plain
 * black wordmark stay legible against the dark theme's near-black surface,
 * while USDC/Circle's own full-color marks look fine on the same chip too —
 * one consistent treatment regardless of the source file's native colors.
 */

function LogoBadge({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-white p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className ?? "h-3 w-auto"} />
    </span>
  );
}

export function CircleMark({ className }: { className?: string }) {
  return <LogoBadge src="/circle.svg" alt="Circle" className={className} />;
}

export function ArcMark({ className }: { className?: string }) {
  return <LogoBadge src="/Arc.svg" alt="Arc" className={className} />;
}

export function X402Mark({ className }: { className?: string }) {
  return <LogoBadge src="/x402.svg" alt="x402" className={className} />;
}

export function UsdcMark({ className }: { className?: string }) {
  return <LogoBadge src="/USDC.svg" alt="USDC" className={className} />;
}
