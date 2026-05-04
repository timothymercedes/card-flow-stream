import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/tos")({
  head: () => ({ meta: [{ title: "Terms of Service — PullBid Live" }, { name: "description", content: "PullBid Live Terms of Service governing platform use, auctions, and acceptable behavior." }] }),
  component: TOS,
});

function TOS() {
  return (
    <LegalLayout title="Terms of Service" updated="May 4, 2026">
      <p>By accessing or using PullBid Live ("Platform"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>

      <h2>1. Eligibility & Account</h2>
      <ul>
        <li>You must be 18+ (or the age of majority in your jurisdiction) to use the Platform.</li>
        <li>You are responsible for keeping your login credentials secure.</li>
        <li>One account per person. Impersonation, fake accounts, and bots are prohibited.</li>
      </ul>

      <h2>2. Acceptable Behavior</h2>
      <ul>
        <li>No fraud, scams, or fake listings.</li>
        <li>No counterfeit, stolen, or illegal items.</li>
        <li>No harassment, hate speech, threats, or doxxing in chat or DMs.</li>
        <li>No attempts to manipulate auctions (shill bidding, bid retraction abuse, collusion).</li>
        <li>No circumventing the Platform to complete transactions off-site.</li>
      </ul>

      <h2>3. Live Auctions & Bidding</h2>
      <ul>
        <li><strong>All bids are binding.</strong> Placing a bid is a legal commitment to purchase if you win.</li>
        <li>Snipe extensions, slow-mode chat, mystery breaks, and giveaway rules are set by the host and apply to all viewers.</li>
        <li>Winners must complete payment within the time stated in the cart.</li>
        <li>Failure to pay may result in account suspension and forfeiture of items.</li>
      </ul>

      <h2>4. Transactions & Liability</h2>
      <ul>
        <li>Users are responsible for their own transactions. The Platform facilitates connections but is not a party to the sale.</li>
        <li>The Platform is <strong>not liable</strong> for disputes between buyers and sellers, item condition disagreements, or shipping losses, except as required by law.</li>
        <li>Disputes should be filed through the in-app dispute system.</li>
      </ul>

      <h2>5. Violations & Enforcement</h2>
      <ul>
        <li>The Platform may, at its sole discretion, warn, suspend, or permanently ban accounts that violate these Terms.</li>
        <li>Repeated or severe violations (fraud, fakes, payment abuse) result in immediate ban without refund of fees.</li>
        <li>The Platform may remove listings, end streams, void auctions, or freeze payouts where rules are broken.</li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>All Platform code, branding, and content is owned by PullBid Live. User-generated content remains owned by the user, but you grant the Platform a worldwide license to display it within the service.</p>

      <h2>7. Disclaimers</h2>
      <p>The Platform is provided "AS IS" without warranties of any kind. We do not guarantee uninterrupted service, accuracy of listings, or any specific outcome from auctions.</p>

      <h2>8. Changes</h2>
      <p>We may update these Terms. Continued use after changes means you accept the updated Terms.</p>

      <h2>9. Contact</h2>
      <p>Questions: support@pullbidlive.com</p>
    </LegalLayout>
  );
}
