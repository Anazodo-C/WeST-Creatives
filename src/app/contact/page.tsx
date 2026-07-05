"use client";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-3xl font-extrabold">Contact</h1>
      <p className="mt-2 text-muted">Questions, partnerships, or hackathon judging inquiries.</p>
      <form className="mt-8 space-y-4">
        <input
          placeholder="Your email"
          className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-sm outline-none focus:border-neon-dim"
        />
        <textarea
          placeholder="Message"
          rows={4}
          className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-2.5 text-sm outline-none focus:border-neon-dim"
        />
        <button
          type="button"
          onClick={() => alert("Wire this to your inbox/CRM of choice — form submission not yet connected.")}
          className="w-full rounded-xl bg-neon py-2.5 font-semibold text-black"
        >
          Send
        </button>
      </form>
    </div>
  );
}
