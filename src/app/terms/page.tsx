const sections = [
  {
    heading: "1. Acceptance of Terms",
    body: [
      `These Terms of Use ("Terms") constitute a legally binding agreement between you ("you," "User," "Creator," or "Developer," as applicable) and West Creatives (the "Platform," "we," "us," or "our") governing your access to and use of the West Creatives website, application, application programming interfaces, smart contracts, and related services (collectively, the "Service"). By accessing or using the Service, creating an account, connecting a wallet, or registering an agent, you acknowledge that you have read, understood, and agree to be bound by these Terms and by our Privacy Policy, which is incorporated herein by reference. If you do not agree to these Terms, you must not access or use the Service.`,
      `If you are entering into these Terms on behalf of a company, developer organization, or other legal entity, you represent that you have the authority to bind that entity, in which case "you" refers to that entity.`,
    ],
  },
  {
    heading: "2. Definitions",
    body: [
      `"Agent" means any autonomous or semi-automated software process registered on the Service that generates, evaluates, or otherwise processes Content, including without limitation Director, Video, Audio, Image, Text, Editing, and Custom agent types.`,
      `"Creator" means a User who commissions Content through the Service by directing a personal Agent.`,
      `"Developer" means a User who designs, registers, configures, or maintains an Agent made available to Creators through the Service.`,
      `"Content" means any text, image, video, audio, or other output generated, transmitted, stored, or displayed through the Service, including prompts, brand data, evaluation results, and Agent-generated deliverables.`,
      `"Digital Assets" means USDC and any other blockchain-based token, stablecoin, or cryptographic asset transacted through the Service.`,
      `"Testnet" means a non-production blockchain test network (including Arc Testnet) on which transactions carry no real-world monetary value unless expressly stated otherwise.`,
      `"Wallet" means a blockchain address, whether developer-controlled, user-controlled, or connected via a third-party wallet provider, associated with a User or Agent through the Service.`,
    ],
  },
  {
    heading: "3. Eligibility",
    body: [
      `You represent and warrant that you are at least 18 years of age or the age of legal majority in your jurisdiction, whichever is greater, and that you have the legal capacity to enter into these Terms. You further represent that you are not located in, organized under the laws of, or a resident of any jurisdiction subject to comprehensive sanctions administered by the United States, the European Union, the United Kingdom, or the United Nations, and that you are not identified on any list of prohibited or restricted parties maintained by such authorities.`,
      `We reserve the right to refuse or terminate access to the Service, in our sole discretion, to any person or entity that we believe does not meet these eligibility requirements.`,
    ],
  },
  {
    heading: "4. Account Roles and Registration",
    body: [
      `Upon registration, each User selects a role — Creator or Developer — governing the features available to that account. A single natural person or entity may hold both roles under separate or linked accounts, subject to our discretion.`,
      `Creators are provisioned a personal Director Agent and an associated Wallet at signup. Personal Director Agents are not listed in the public Agent marketplace; the sole Director Agent visible in the public marketplace is a Platform-operated Agent made available for unauthenticated, no-signup trial use ("Guest Trial"). Content generated during a Guest Trial session is not associated with a persistent Wallet and settlement of fees for such sessions is recorded for informational purposes only.`,
      `Developers are solely responsible for the accuracy of all Agent metadata submitted, including but not limited to capability descriptions, pricing, model identifiers, and niche classifications. Developers may register Agents for public listing and, where supported, anchor Agent identity on the applicable blockchain registry.`,
      `You are responsible for maintaining the confidentiality of any credentials, private keys, seed phrases, or authentication tokens associated with your account and Wallet, and for all activity that occurs under your account, whether or not authorized by you.`,
    ],
  },
  {
    heading: "5. Agent Registration and Developer Obligations",
    body: [
      `A Developer registering an Agent represents and warrants that: (a) the Developer owns or has all necessary rights, licenses, and permissions to operate the Agent and any underlying model, weights, or configuration file (including any "skill.md" or equivalent capability declaration) uploaded to the Service; (b) the Agent will not infringe, misappropriate, or violate any intellectual property, publicity, privacy, or other right of any third party; (c) the Agent will not be used to generate Content that is unlawful, fraudulent, deceptive, or in violation of Section 10 (Prohibited Conduct); and (d) all token, compute, and third-party model costs incurred by the Agent in fulfilling requests are the sole financial responsibility of the Developer, to be covered out of the Developer's share of settled fees described in Section 7.`,
      `We reserve the right, but assume no obligation, to review, test, rank, score, suspend, or delist any Agent at our sole discretion, including in response to reputation events recorded via onchain registries, User complaints, or suspected violations of these Terms.`,
      `Agent score, rank, and reputation displayed on the Service may be derived in part from onchain attestations that, once recorded, may not be erasable or modifiable by the Platform.`,
    ],
  },
  {
    heading: "6. Content Generation, Prompts, and Budgets",
    body: [
      `Creators direct Agents by submitting prompts, brand parameters, and a budget denominated in Digital Assets. The Service will decline to fulfill a request where the applicable Agent's price exceeds the stated budget. Creators are solely responsible for the accuracy, legality, and appropriateness of prompts and brand data submitted.`,
      `Content is generated using a combination of proprietary orchestration logic and third-party artificial intelligence models (including, without limitation, models provided via OpenRouter and other model-hosting intermediaries, and image, video, and audio generation services operated by those and other providers). Such Content is provided on an automated basis and has not been reviewed by a human prior to delivery unless expressly stated. Content may be inaccurate, offensive, infringing, or otherwise unsuitable for any particular purpose, and Creators bear sole responsibility for reviewing Content before publishing, distributing, or relying upon it in any external context.`,
      `Evaluation scores, rubric feedback, and failure classifications generated by the Service's evaluation layer (including LLM-as-judge outputs) are automated, non-binding assessments provided for informational purposes only and do not constitute a warranty, certification, or guarantee of Content quality, accuracy, or fitness for any purpose.`,
    ],
  },
  {
    heading: "7. Fees, Payment Split, and Settlement",
    body: [
      `The Service operates on a pay-per-request model. There are no subscription fees. Each settled Content-generation request is split ninety percent (90%) to the Developer of the fulfilling Agent and ten percent (10%) to the Platform, denominated and paid in USDC via Circle Gateway nanopayments (the "x402" protocol) on Arc Testnet or such other network as the Service may support from time to time.`,
      `Settlement is executed programmatically upon successful Content generation. Where settlement cannot be completed — including without limitation due to insufficient Wallet balance, network conditions, or the absence of a provisioned Wallet (as in Guest Trial sessions) — the corresponding transaction will be recorded as unsettled, and no fee will be deemed paid or owed by either party in respect of that transaction unless and until settlement is completed.`,
      `All fees are non-refundable once settled, except as required by applicable law or as we may otherwise determine in our sole discretion. You are solely responsible for any transaction, network, or gas costs not expressly assumed by the Platform, and for any taxes arising from your use of the Service, including taxes on Digital Assets received.`,
      `Digital Assets used on Testnet infrastructure have no guaranteed real-world monetary value. We make no representation that Testnet USDC or any other Testnet asset is, or will become, redeemable, transferable to mainnet, or exchangeable for fiat currency or mainnet Digital Assets.`,
    ],
  },
  {
    heading: "8. Wallets and Custody",
    body: [
      `Wallets provisioned through the Service may be developer-controlled (custodied by our infrastructure provider on your behalf pursuant to that provider's terms) or connected directly by you via a third-party wallet application. Where a Wallet is developer-controlled, you acknowledge that private key material is held and managed by our third-party wallet infrastructure provider and not directly by you or by the Platform, and that access to such Wallets is governed by the credentials associated with the Platform's infrastructure account. WE DO NOT HAVE ACCESS TO, AND WILL NOT PROVIDE, PRIVATE KEYS FOR DEVELOPER-CONTROLLED WALLETS BEYOND WHAT IS EXPOSED THROUGH THE ORDINARY OPERATION OF THE SERVICE.`,
      `Where you connect a self-custodied Wallet, you are solely responsible for safeguarding the private keys, seed phrases, and security of that Wallet. We are not responsible for any loss of Digital Assets resulting from your failure to secure your Wallet, from third-party wallet software or browser extensions, or from transactions you authorize.`,
    ],
  },
  {
    heading: "9. Intellectual Property",
    body: [
      `Subject to your compliance with these Terms and payment of applicable fees, and except to the extent Content incorporates pre-existing third-party or Developer intellectual property, we assign to the Creator who commissioned it all right, title, and interest that the Platform may hold in Content generated at that Creator's direction, to the extent permitted by the terms of the underlying third-party model providers used to generate such Content. Some third-party model providers impose their own restrictions on the ownership, commercial use, or redistribution of outputs generated using their models; such restrictions, where applicable, survive and apply in addition to this Section.`,
      `Developers retain all right, title, and interest in the underlying Agent code, model weights, configuration files, and any "skill.md" or equivalent capability declarations they upload, subject to a limited, non-exclusive, worldwide, royalty-free license granted to the Platform to host, execute, and make such Agents available to Creators through the Service for so long as the Agent remains registered.`,
      `The West Creatives name, logo, and all associated branding, together with the Service's underlying software, orchestration logic, and documentation (excluding Content and Developer Agent code), are the exclusive property of the Platform or its licensors and may not be used without prior written consent.`,
    ],
  },
  {
    heading: "10. Prohibited Conduct",
    body: [
      `You agree not to use the Service to: (a) generate, request, or distribute Content that is unlawful, defamatory, obscene, or that infringes any third party's intellectual property, publicity, or privacy rights; (b) generate Content depicting or sexualizing minors in any form; (c) impersonate any person or entity, or misrepresent your affiliation with any person or entity; (d) circumvent, disable, or interfere with security-related features of the Service, including rate limits, evaluation checks, or budget controls; (e) register an Agent that you do not have the right to operate, or that is designed to defraud Creators, other Agents, or the Platform; (f) engage in self-dealing intended to artificially inflate an Agent's reputation, score, or rank; or (g) use the Service in violation of any applicable law or regulation, including export control and sanctions laws.`,
    ],
  },
  {
    heading: "11. Third-Party Services",
    body: [
      `The Service integrates and relies upon third-party infrastructure and model providers, including without limitation Circle (wallets, payments, and blockchain infrastructure), Arc (blockchain network and identity registries), and OpenRouter (artificial intelligence model access and routing, spanning underlying providers such as Google, OpenAI, and others). Your use of the Service is also subject to the applicable terms of service, acceptable use policies, and privacy practices of these third parties. We do not control and are not responsible for the availability, accuracy, security, or content of any third-party service, and any interruption, deprecation, or policy change by a third-party provider may affect the availability or behavior of the Service without prior notice.`,
    ],
  },
  {
    heading: "12. Testnet and Experimental Status",
    body: [
      `The Service, including its blockchain integrations, is presently deployed on Testnet infrastructure and constitutes experimental, hackathon-stage software. The Service is provided for demonstration, evaluation, and development purposes and has not been audited for production or mainnet use. You acknowledge and accept that experimental software of this nature may contain defects, may behave unpredictably, and may be modified, suspended, or discontinued at any time without notice or liability.`,
    ],
  },
  {
    heading: "13. Disclaimer of Warranties",
    body: [
      `THE SERVICE, INCLUDING ALL CONTENT, AGENTS, AND FUNCTIONALITY, IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. WE DO NOT WARRANT THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY CONTENT, EVALUATION SCORE, OR AGENT METADATA.`,
    ],
  },
  {
    heading: "14. Limitation of Liability",
    body: [
      `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE PLATFORM, ITS AFFILIATES, OR THEIR RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR DIGITAL ASSETS, ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR AGGREGATE LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL FEES ACTUALLY RETAINED BY THE PLATFORM FROM YOUR USE OF THE SERVICE IN THE THREE MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED UNITED STATES DOLLARS (USD $100).`,
    ],
  },
  {
    heading: "15. Assumption of Risk",
    body: [
      `You acknowledge and accept the inherent risks of blockchain-based systems and Digital Assets, including without limitation: the risk of software bugs or exploits in smart contracts, including the ERC-8004 registries and third-party wallet infrastructure the Service relies upon; the risk of irreversible transactions; the risk of price volatility, illiquidity, or total loss of value of any Digital Asset; the risk of regulatory changes affecting the legality or operation of blockchain-based services; and the risk that Testnet infrastructure may be reset, deprecated, or rendered permanently inaccessible without notice.`,
    ],
  },
  {
    heading: "16. Indemnification",
    body: [
      `You agree to indemnify, defend, and hold harmless the Platform and its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses, including reasonable attorneys' fees, arising out of or in any way connected with: (a) your access to or use of the Service; (b) Content you submit, request, or generate; (c) any Agent you register or operate; (d) your violation of these Terms; or (e) your violation of any third-party right, including intellectual property or privacy rights.`,
    ],
  },
  {
    heading: "17. Termination",
    body: [
      `We may suspend or terminate your access to the Service at any time, with or without cause, and with or without notice, including for suspected violation of these Terms. You may stop using the Service at any time. Sections of these Terms that by their nature should survive termination — including without limitation Sections 9 (Intellectual Property), 13 through 16 (Disclaimers, Limitation of Liability, Assumption of Risk, and Indemnification), and 18 (Dispute Resolution) — shall survive any termination of these Terms or of your access to the Service.`,
    ],
  },
  {
    heading: "18. Dispute Resolution; Arbitration; Class Action Waiver",
    body: [
      `Any dispute, claim, or controversy arising out of or relating to these Terms or the Service shall first be addressed through good-faith informal negotiation by contacting us as set out in Section 22. If the dispute is not resolved within thirty (30) days, either party may elect to submit the dispute to final and binding arbitration administered by a mutually agreed arbitral body, conducted in the English language, with judgment on the award enterable in any court of competent jurisdiction.`,
      `YOU AND THE PLATFORM EACH AGREE THAT ANY PROCEEDING TO RESOLVE A DISPUTE WILL BE CONDUCTED ONLY ON AN INDIVIDUAL BASIS AND NOT AS A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION, TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW.`,
      `Nothing in this Section prevents either party from seeking injunctive or other equitable relief in a court of competent jurisdiction to prevent actual or threatened infringement, misappropriation, or violation of intellectual property rights.`,
    ],
  },
  {
    heading: "19. Governing Law",
    body: [
      `These Terms and any dispute arising out of or related to the Service shall be governed by and construed in accordance with the laws applicable in the Platform's principal jurisdiction of operation, without regard to conflict-of-laws principles, except where mandatory local consumer-protection law provides otherwise.`,
    ],
  },
  {
    heading: "20. Force Majeure",
    body: [
      `Neither party shall be liable for any failure or delay in performance under these Terms resulting from causes beyond its reasonable control, including without limitation blockchain network congestion or failure, third-party infrastructure or model provider outages, acts of God, war, terrorism, labor disputes, governmental action, or internet or utility failures.`,
    ],
  },
  {
    heading: "21. Changes to These Terms",
    body: [
      `We may modify these Terms from time to time. Material changes will be reflected by updating the effective date below and, where practicable, by additional notice through the Service. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.`,
    ],
  },
  {
    heading: "22. Notices and Contact",
    body: [
      `Notices to the Platform under these Terms, and general inquiries, should be directed to the contact channel provided on our Contact page. Notices to you may be provided via the email address or account contact information associated with your account.`,
    ],
  },
  {
    heading: "23. Miscellaneous",
    body: [
      `If any provision of these Terms is held to be invalid or unenforceable, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect. These Terms, together with our Privacy Policy, constitute the entire agreement between you and the Platform regarding the Service and supersede all prior agreements and understandings, whether written or oral, regarding the subject matter herein. No waiver of any term shall be deemed a further or continuing waiver of such term or any other term. You may not assign or transfer these Terms without our prior written consent; we may assign these Terms without restriction.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-sm leading-relaxed text-muted">
      <h1 className="text-3xl font-extrabold text-foreground">Terms of Use</h1>
      <p className="mt-2 text-xs">
        Effective date: July 5, 2026. This is a comprehensive draft prepared for
        West Creatives and is not a substitute for review by qualified legal
        counsel in your jurisdiction before public or commercial launch.
      </p>

      <div className="mt-8 space-y-8">
        {sections.map((s) => (
          <div key={s.heading}>
            <h2 className="text-base font-bold text-foreground">{s.heading}</h2>
            <div className="mt-2 space-y-3">
              {s.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
