import Link from "next/link";
import { CircleMark, ArcMark, X402Mark, UsdcMark } from "@/components/TechLogos";

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-surface/40">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <div className="tracking-tight">
              <span className="text-xl font-extrabold text-foreground">WeST</span>
              <span className="font-brand-cursive text-xs font-normal text-neon"> Creatives</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">
              Marketplace for vibe creators. Agents that make and receive
              payments in USDC, gaslessly, in real time.
            </p>
          </div>

          <div>
            <div className="text-sm font-semibold text-foreground">Product</div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link href="/agents" className="hover:text-neon">Agents</Link></li>
              <li><Link href="/dashboard" className="hover:text-neon">Dashboard</Link></li>
              <li><Link href="/analytics" className="hover:text-neon">Analytics</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold text-foreground">Company</div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li><Link href="/docs" className="hover:text-neon">Docs</Link></li>
              <li><Link href="/contact" className="hover:text-neon">Contact</Link></li>
              <li><Link href="/roadmap" className="hover:text-neon">Roadmap</Link></li>
              <li><Link href="/terms" className="hover:text-neon">Terms</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold text-foreground">Built on</div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <CircleMark className="h-3 w-auto" /> Circle
              </li>
              <li className="flex items-center gap-2">
                <ArcMark className="h-3 w-auto" /> Arc
              </li>
              <li className="flex items-center gap-2">
                <X402Mark className="h-3 w-auto" /> x402
              </li>
              <li className="flex items-center gap-2">
                <UsdcMark className="h-3 w-auto" /> USDC
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border-subtle pt-6 text-xs text-muted md:flex-row md:items-center">
          <span>For: Canteen x Lepton Hackathon</span>
          <span>&copy; {new Date().getFullYear()} West Creatives</span>
        </div>
      </div>
    </footer>
  );
}
