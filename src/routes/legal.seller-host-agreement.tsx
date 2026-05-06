import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/seller-host-agreement")({
  head: () => ({
    meta: [
      { title: "Seller & Live Host Agreement — PullBid Live" },
      { name: "description", content: "Required agreement for sellers and livestream hosts on PullBid Live." },
    ],
  }),
  component: SellerHostAgreement,
});

function SellerHostAgreement() {
  return (
    <LegalLayout title="Seller & Live Host Agreement" updated="May 6, 2026">
      <p>
        This agreement is in addition to the Terms of Service and Community Guidelines.
        You must accept this agreement before you can sell, receive payouts, go live, run auctions,
        host Flex Live, or co-host any livestream.
      </p>

      <h2>1. Verification</h2>
      <ul>
        <li>Sellers and live hosts must complete: email verification, phone verification, and selfie/profile verification.</li>
        <li>Optional: link a public store or social account.</li>
        <li>An admin must approve your account before you gain access to seller / live tools.</li>
        <li>Approved sellers will not be re-prompted unless: heavy reports, suspicious activity, payout/fraud issue, or admin manually flags the account.</li>
      </ul>

      <h2>2. Shipping Responsibilities</h2>
      <ul>
        <li>Ship paid orders within <strong>3 business days</strong>.</li>
        <li>Provide tracking within 24 hours of shipment.</li>
        <li>Use packaging appropriate for the item (toploader/sleeve, bubble mailer minimum).</li>
        <li>Honor combined-shipping caps for buyers winning multiple items in the same stream.</li>
      </ul>

      <h2>3. Prohibited Items & Counterfeits</h2>
      <ul>
        <li>No counterfeit, reproduction, proxy, or knowingly altered items.</li>
        <li>No illegal goods, weapons, drugs, recalled items, or items that violate IP/trademark.</li>
        <li>Violations result in immediate permanent ban, payout freeze, and possible reporting to authorities.</li>
      </ul>

      <h2>4. Scam & Fraud Policy</h2>
      <ul>
        <li>No shill bidding, fake bidders, collusion, or misleading auctions.</li>
        <li>No misrepresenting condition, authenticity, or contents of breaks/mystery items.</li>
        <li>Fraudulent activity = permanent ban and payout forfeiture toward refunds.</li>
      </ul>

      <h2>5. Livestream Conduct</h2>
      <p>You are responsible for everything that happens on your stream, including the behavior of co-hosts and moderators. Prohibited on-stream:</p>
      <ul>
        <li>Nudity, sexual or exploitative content, inappropriate exposure</li>
        <li>Harassment, bullying, hate speech, threats</li>
        <li>Scam pitches or off-platform payment requests</li>
        <li>Dangerous, illegal, or self-harm content</li>
      </ul>

      <h2>6. AI Moderation & Recording Disclosure</h2>
      <ul>
        <li>Livestreams may be <strong>AI-moderated</strong> in real time.</li>
        <li>Livestreams may be <strong>recorded</strong> for safety, dispute, and moderation review.</li>
        <li>Admins and moderators may review flagged streams and chats.</li>
      </ul>

      <h2>7. Payouts, Chargebacks & Disputes</h2>
      <ul>
        <li>Payouts are sent through your connected payout account on the standard schedule.</li>
        <li>Payouts may be held during open disputes, chargebacks, or suspected fraud.</li>
        <li>You must respond to dispute requests promptly. Refunds for valid disputes must be processed without delay.</li>
        <li>Excessive chargeback rates may result in suspension.</li>
      </ul>

      <h2>8. Moderation, Suspension & Termination</h2>
      <ul>
        <li>The platform may at its sole discretion: end a live stream, suspend seller access, hold payouts, or permanently ban an account.</li>
        <li>Reasons include: violations of this agreement, the Terms of Service, or the Community Guidelines.</li>
      </ul>

      <h2>9. Re-Acceptance</h2>
      <p>
        If this agreement is updated, you will be required to re-accept before continuing to use seller or live features.
        Admins may also force re-acceptance after a serious violation or compliance review.
      </p>

      <h2>10. Acknowledgement</h2>
      <p>By accepting, you confirm you understand and will follow this agreement, the Terms of Service, and the Community Guidelines.</p>
    </LegalLayout>
  );
}
