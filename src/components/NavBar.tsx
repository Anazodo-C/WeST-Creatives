"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Moon, Sun, LogOut } from "lucide-react";

export default function NavBar() {
  const [light, setLight] = useState(false);
  const { data: session } = useSession();

  // Restore saved theme preference on mount.
  useEffect(() => {
    const saved = localStorage.getItem("vibe.theme");
    const isLight = saved === "light";
    setLight(isLight);
    document.documentElement.classList.toggle("light", isLight);
  }, []);

  function toggleTheme() {
    setLight((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("light", next);
      localStorage.setItem("vibe.theme", next ? "light" : "dark");
      return next;
    });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-background/80 backdrop-blur">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-4">
        <Link href="/" className="justify-self-start tracking-tight">
          <span className="text-xl font-extrabold text-foreground">WeST</span>
          <span className="font-brand-cursive text-xs font-normal text-neon"> Creatives</span>
        </Link>

        <nav className="hidden items-center justify-center gap-8 text-sm font-medium text-muted md:flex">
          <Link href="/agents" className="hover:text-foreground transition-colors">
            Agents
          </Link>
          <Link href="/dashboard" className="hover:text-foreground transition-colors">
            Dashboard
          </Link>
          <Link href="/analytics" className="hover:text-foreground transition-colors">
            Analytics
          </Link>
        </nav>

        <div className="flex items-center justify-end gap-4">
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full border border-border-subtle p-2 text-muted hover:text-neon transition-colors"
          >
            {light ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {session?.user ? (
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex items-center gap-2 rounded-full border border-neon-dim bg-neon/10 px-3 py-1.5 text-sm text-neon"
              title="Sign out"
            >
              {session.user.email ?? session.user.name}
              <LogOut size={13} />
            </button>
          ) : (
            <ConnectButton
              label="Connect Wallet"
              chainStatus="icon"
              accountStatus="address"
              showBalance={false}
            />
          )}
        </div>
      </div>
    </header>
  );
}
