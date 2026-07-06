"use client";

/**
 * App-wide notification system: replaces window.alert()-style error
 * handling with (a) a transient toast that auto-dismisses after a few
 * seconds, visible right where the action happened, and (b) a persistent
 * entry in a bell-icon dropdown (see src/components/NavBar.tsx) so anything
 * missed as a toast — or from an action taken on a different page — is
 * still discoverable afterward, with an unread-count badge.
 *
 * Usage: const { notify } = useNotifications(); notify("message", "error").
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type NotificationKind = "error" | "success" | "info";

export interface AppNotification {
  id: string;
  message: string;
  kind: NotificationKind;
  createdAt: number;
  read: boolean;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  notify: (message: string, kind?: NotificationKind) => void;
  markAllRead: () => void;
  dismissToast: (id: string) => void;
  toasts: AppNotification[];
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Fail soft rather than crash the whole app if a component ever renders
    // outside the provider (shouldn't happen — it wraps the root layout —
    // but a silent no-op is safer than a hard error for a notification
    // system specifically).
    return {
      notifications: [],
      unreadCount: 0,
      notify: () => {},
      markAllRead: () => {},
      dismissToast: () => {},
      toasts: [],
    };
  }
  return ctx;
}

const TOAST_LIFETIME_MS = 6000;
// Keep the bell dropdown from growing unbounded over a long session.
const MAX_HISTORY = 50;

export default function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);

  const notify = useCallback((message: string, kind: NotificationKind = "info") => {
    const item: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message,
      kind,
      createdAt: Date.now(),
      read: false,
    };
    setNotifications((prev) => [item, ...prev].slice(0, MAX_HISTORY));
    setToasts((prev) => [...prev, item]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, notify, markAllRead, dismissToast, toasts }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: AppNotification[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} notification={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ notification, onDismiss }: { notification: AppNotification; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_LIFETIME_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.id]);

  const Icon = notification.kind === "error" ? AlertCircle : notification.kind === "success" ? CheckCircle2 : Info;
  const color =
    notification.kind === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-400"
      : notification.kind === "success"
        ? "border-neon-dim bg-neon/10 text-neon"
        : "border-border-subtle bg-surface text-foreground";

  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-xl border p-3 text-sm shadow-lg backdrop-blur ${color}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <p className="flex-1 leading-snug">{notification.message}</p>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
