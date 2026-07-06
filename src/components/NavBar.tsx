"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Moon, Sun, LogOut, Bell, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useNotifications } from "@/components/NotificationProvider";

function timeAgo(ts: number): string {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markAllRead();
        }}
        aria-label="Notifications"
        className="relative rounded-full border border-border-subtle p-2 text-muted hover:text-neon transition-colors"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-border-subtle bg-surface shadow-xl">
          <div className="border-b border-border-subtle px-3 py-2 text-xs font-semibold text-muted">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted">Nothing yet.</p>
          ) : (
            <ul>
              {notifications.map((n) => {
                const Icon = n.kind === "error" ? AlertCircle : n.kind === "success" ? CheckCircle2 : Info;
                const color =
                  n.kind === "error" ? "text-red-400" : n.kind === "success" ? "text-neon" : "text-muted";
                return (
                  <li key={n.id} className="flex items-start gap-2 border-b border-border-subtle/50 px-3 py-2.5 text-xs last:border-0">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${color}`} />
                    <div className="flex-1">
                      <p className="leading-snug text-foreground">{n.message}</p>
                      <p className="mt-0.5 text-[10px] text-muted">{timeAgo(n.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

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
          <NotificationBell />
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
