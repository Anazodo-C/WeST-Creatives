"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Moon, Sun, Search, LogOut } from "lucide-react";

export default function NavBar() {
  const [dark, setDark] = useState(true);
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-glow">
          VIBE<span className="text-neon">.</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-8 text-sm font-medium text-muted md:flex">
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

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-sm text-muted md:flex">
            <Search size={14} />
            <input
              placeholder="Search agents..."
              className="w-32 bg-transparent outline-none placeholder:text-muted"
            />
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle theme"
            className="rounded-full border border-border-subtle p-2 text-muted hover:text-neon transition-colors"
          >
            {dark ? <Moon size={16} /> : <Sun size={16} />}
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
            <div className="rounded-full border border-border-subtle px-3 py-1.5 text-sm text-muted">
              No agent connected
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
