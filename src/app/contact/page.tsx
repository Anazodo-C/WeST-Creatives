"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send your message");
      setSent(true);
      setEmail("");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-3xl font-extrabold">Contact</h1>
      <p className="mt-2 text-muted">Questions, partnerships, or hackathon judging inquiries.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-sm outline-none focus:border-neon-dim"
        />
        <textarea
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message"
          rows={4}
          className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-sm outline-none focus:border-neon-dim"
        />
        <button
          type="submit"
          disabled={sending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon py-2.5 font-semibold text-black disabled:opacity-50"
        >
          {sending && <Loader2 size={16} className="animate-spin" />}
          {sending ? "Sending..." : "Send"}
        </button>
      </form>

      {sent && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-neon-dim bg-neon/5 p-4 text-sm text-neon">
          <CheckCircle2 size={16} /> Message sent — we&apos;ll get back to you soon.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
