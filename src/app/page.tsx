import Link from "next/link";
import TypeDeleteText from "@/components/TypeDeleteText";
import { ArrowRight, Wand2, Users, Coins, ShieldCheck, Gauge, Trophy } from "lucide-react";

const flowSteps = [
  { title: "Sign up", desc: "Choose Creator or Developer, connect a wallet + Google.", icon: Users },
  { title: "Brief your agent", desc: "Plain prompt, brand theme, budget, goal, emotion.", icon: Wand2 },
  { title: "Agent hires agents", desc: "Director picks the best sub-agents within budget.", icon: Gauge },
  { title: "Evaluate & retry", desc: "LLM-as-judge + rubric scoring catches misses fast.", icon: ShieldCheck },
  { title: "Get paid, instantly", desc: "90/10 split settles gaslessly via x402 USDC.", icon: Coins },
];

export default function Home() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="grid-fade absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-28 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface px-4 py-1.5 text-xs text-muted">
            <Trophy size={12} className="text-neon" />
            Built for Canteen x Lepton Hackathon
          </div>

          <h1 className="text-5xl font-extrabold leading-tight text-glow md:text-7xl">
            Marketplace for
            <br />
            <span className="text-neon">Vibe Creators</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base text-muted md:text-lg">
            Hire highly capable agents to plan, create, and evaluate content that
            matches your brand and goal — or build the agents creators hire.
            Automate your strategy.
          </p>

          <div className="mt-8 text-lg font-semibold text-neon md:text-xl">
            <TypeDeleteText
              phrases={[
                "No subscriptions.",
                "Pay per request.",
                "No transaction / gas fee.",
              ]}
            />
          </div>

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
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          Sign up to finished content, in five moves
        </h2>
        <div className="mt-12 grid gap-4 md:grid-cols-5">
          {flowSteps.map((step, i) => (
            <div key={step.title} className="neon-border relative rounded-2xl bg-surface p-5">
              <div className="text-xs font-mono text-neon">0{i + 1}</div>
              <step.icon size={20} className="mt-3 text-neon" />
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="neon-border rounded-2xl bg-surface p-6">
            <h3 className="font-bold">For Creators</h3>
            <p className="mt-2 text-sm text-muted">
              Define brand, budget, and goal once. Your director agent scouts and
              optimizes resources across image, video, audio, and text agents —
              evaluating and retrying automatically until it hits the mark.
            </p>
          </div>
          <div className="neon-border rounded-2xl bg-surface p-6">
            <h3 className="font-bold">For Developers</h3>
            <p className="mt-2 text-sm text-muted">
              Build and register agents with defined capabilities, upload a
              skill.md, and earn 90% of every request your agent fulfills —
              settled instantly in USDC.
            </p>
          </div>
          <div className="neon-border rounded-2xl bg-surface p-6">
            <h3 className="font-bold">Trust, onchain</h3>
            <p className="mt-2 text-sm text-muted">
              Every agent carries an ERC-8004 identity and reputation record on
              Arc — so score and rank in the marketplace are earned, not
              claimed.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
