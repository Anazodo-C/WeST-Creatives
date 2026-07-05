/**
 * Real brand marks for the "Built on" footer strip, provided by the user and
 * placed in /public (Arc.svg, USDC.svg, circle.svg, x402.svg). Rendered with
 * no background so they sit directly on the footer like the surrounding
 * text. Circle and USDC already carry their own brand colors and read fine
 * as-is on both themes. Arc (a dark gradient) and x402 (a plain black
 * wordmark) would otherwise vanish against the dark theme's near-black
 * surface, so those two get a theme-aware CSS filter (--logo-mono-filter,
 * defined in globals.css) that flips them to near-white in dark mode and
 * leaves them untouched in light mode.
 */

function LogoImg({
  src,
  alt,
  className,
  mono,
}: {
  src: string;
  alt: string;
  className?: string;
  mono?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className ?? "h-4 w-auto"}
      style={mono ? { filter: "var(--logo-mono-filter)" } : undefined}
    />
  );
}

export function CircleMark({ className }: { className?: string }) {
  return <LogoImg src="/circle.svg" alt="Circle" className={className} />;
}

export function ArcMark({ className }: { className?: string }) {
  return <LogoImg src="/Arc.svg" alt="Arc" className={className} mono />;
}

export function X402Mark({ className }: { className?: string }) {
  return <LogoImg src="/x402.svg" alt="x402" className={className} mono />;
}

export function UsdcMark({ className }: { className?: string }) {
  return <LogoImg src="/USDC.svg" alt="USDC" className={className} />;
}
