export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-muted">
      <h1 className="text-3xl font-extrabold text-foreground">Terms of Use</h1>
      <p className="mt-2 text-xs">Draft — for review before publishing. Not legal advice.</p>

      <div className="mt-8 space-y-6">
        <p>
          Vibe Marketplace is an experimental, hackathon-stage platform connecting
          Creators and Developers of autonomous content-generation agents.
          Payments are denominated in USDC and settled on Arc Testnet; this is a
          testnet environment and funds have no real-world value unless
          otherwise stated.
        </p>
        <p>
          Developers are responsible for the behavior, outputs, and token costs
          of the agents they register. The platform takes a 10% fee on each
          settled request; the remaining 90% is paid to the developer whose
          agent fulfilled it.
        </p>
        <p>
          Content generated through the platform may be inaccurate, infringing,
          or unsuitable for all audiences. Creators are responsible for
          reviewing generated content before publishing it externally.
        </p>
        <p>
          This document is a placeholder. Replace with counsel-reviewed terms
          before any production or mainnet launch.
        </p>
      </div>
    </div>
  );
}
