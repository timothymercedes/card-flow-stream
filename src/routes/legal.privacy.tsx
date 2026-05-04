import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — PullBid Live" }, { name: "description", content: "How PullBid Live collects, stores, and uses your data." }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="May 4, 2026">
      <p>This Privacy Policy explains what data PullBid Live collects, how we use it, and the choices you have.</p>

      <h2>1. Data We Collect</h2>
      <ul>
        <li><strong>Account info:</strong> username, email, password (hashed), phone number, profile photo, optional ID document for seller verification.</li>
        <li><strong>Payment info:</strong> processed by Stripe. We do <strong>not</strong> store full card numbers. We store transaction IDs, amounts, payout status, and shipping address.</li>
        <li><strong>Activity:</strong> bids, orders, chat messages, DMs, giveaway entries, stream views, follows, vault entries.</li>
        <li><strong>Device:</strong> IP address, user-agent, push notification tokens.</li>
      </ul>

      <h2>2. How We Use Data</h2>
      <ul>
        <li>To run auctions, deliver orders, and connect buyers and sellers.</li>
        <li>To detect fraud, abuse, and policy violations.</li>
        <li>To send transactional emails, push notifications, and important account updates.</li>
        <li>To improve features and fix bugs.</li>
      </ul>

      <h2>3. How We Share Data</h2>
      <ul>
        <li><strong>Stripe</strong> — for payment processing and seller payouts.</li>
        <li><strong>Cloudflare</strong> — for live video streaming and content delivery.</li>
        <li><strong>Other users</strong> — your username, profile, posts, listings, and bids are visible to others as part of normal Platform use.</li>
        <li>We do not sell your personal data.</li>
        <li>We may disclose data when required by law or to protect users.</li>
      </ul>

      <h2>4. Storage & Security</h2>
      <p>Data is stored on encrypted infrastructure with row-level security. Passwords are hashed. We retain transaction and audit records as long as required for legal, tax, and dispute purposes.</p>

      <h2>5. Your Rights</h2>
      <ul>
        <li>Access, correct, or delete your personal data via your profile settings or by emailing privacy@pullbidlive.com.</li>
        <li>Opt out of non-essential push notifications in settings.</li>
        <li>Some records (e.g. completed transactions, audit logs) must be retained for compliance even after account deletion.</li>
      </ul>

      <h2>6. Children</h2>
      <p>The Platform is not intended for users under 18. We do not knowingly collect data from minors.</p>

      <h2>7. Contact</h2>
      <p>privacy@pullbidlive.com</p>
    </LegalLayout>
  );
}
