"use client";

/**
 * The homepage's primary call-to-action. Signed-out visitors pick a role
 * (Creator/Developer) and land on /signup. Once someone has actually created
 * an account on this browser (vibe.ownerId + vibe.role in localStorage, the
 * same identity the dashboard and signup pages already key off), the role
 * choice is no longer meaningful — they already made it — so re-showing it
 * would just invite creating a second, confusing identity. Instead this
 * renders a single role-aware "Go to your Dashboard" button.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

export default function HomeCta() {
  const [account, setAccount] = useState<{ ownerId: string; role: string } | null | undefined>(undefined);

  useEffect(() => {
    const ownerId = localStorage.getItem("vibe.ownerId");
    const role = localStorage.getItem("vibe.role");
    setAccount(ownerId && role ? { ownerId, role } : null);
  }, []);

  // undefined = not checked yet (first client render, avoids a flash of the
  // wrong CTA before localStorage is read). Render nothing for that one tick.
  if (account === undefined) {
    return <div className="mt-10 h-[52px]" />;
  }

  if (account) {
    return (
      <div className="mt-10 flex flex-col items-center justify-center gap-3">
        <Link
          href="/dashboard"
          className="group flex items-center gap-2 rounded-full bg-neon px-7 py-3 font-semibold text-black transition-transform hover:scale-[1.03]"
        >
          Go to your {account.role} dashboard
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </Link>
        <p className="text-xs text-muted">Signed in as {account.ownerId}</p>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
      <Link
        href="/signup?role=creator"
        className="group flex items-center gap-2 rounded-full bg-neon px-7 py-3 font-semibold text-black transition-transform hover:scale-[1.03]"
      >
        I&apos;m a Creator
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
      </Link>
      <Link
        href="/signup?role=developer"
        className="group flex items-center gap-2 rounded-full border border-border-subtle px-7 py-3 font-semibold text-foreground transition-colors hover:border-neon-dim"
      >
        I&apos;m a Developer
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
