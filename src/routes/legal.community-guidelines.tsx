import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/community-guidelines")({
  head: () => ({ meta: [{ title: "Community Guidelines — PullBid Live" }, { name: "description", content: "Rules of conduct for the PullBid Live community: respect, no fraud, no harassment, fair auctions." }] }),
  component: Guidelines,
});

function Guidelines() {
  return (
    <LegalLayout title="Community Guidelines" updated="May 6, 2026">
      <p>PullBid Live is a community of collectors, hosts, and breakers. These guidelines keep the platform fair, safe, and fun for everyone.</p>

      <h2>1. Be Respectful</h2>
      <ul>
        <li>No harassment, hate speech, threats, slurs, or doxxing — in chat, DMs, or on stream.</li>
        <li>No spam, mass tagging, or stream raids meant to disrupt other users.</li>
        <li>Disagreements happen — handle them through the in-app dispute or report tools, not personal attacks.</li>
      </ul>

      <h2>2. Be Honest</h2>
      <ul>
        <li>No fake accounts, impersonation, or bots.</li>
        <li>No shill bidding, fake bidders, or auction collusion.</li>
        <li>Sellers must describe items accurately. Buyers must bid only when they intend to pay.</li>
      </ul>

      <h2>3. Keep It Legal & Safe</h2>
      <ul>
        <li>No counterfeit, stolen, illegal, or restricted items.</li>
        <li>No nudity, sexual content, or graphic violence on stream or in profile media.</li>
        <li>No promotion of off-platform deals to circumvent platform protections.</li>
      </ul>

      <h2>4. Protect Minors</h2>
      <p>You must be 18+ (or the age of majority in your jurisdiction) to use PullBid Live. Accounts found to belong to minors will be removed.</p>

      <h2>5. Reporting</h2>
      <p>Use the in-app report buttons on streams, users, and chat messages. Urgent moderation issues (harassment, scams, threats) are prioritized by our support team.</p>

      <h2>6. Enforcement</h2>
      <ul>
        <li>Violations may result in chat timeouts, stream bans, account suspension, or permanent removal.</li>
        <li>Severe violations (fraud, fakes, threats, child safety) result in immediate permanent ban.</li>
        <li>Decisions are made at the Platform's sole discretion.</li>
      </ul>
    </LegalLayout>
  );
}
