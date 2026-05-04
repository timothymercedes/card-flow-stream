import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/buyer-terms")({
  head: () => ({ meta: [{ title: "Buyer Terms — PullBid Live" }, { name: "description", content: "Buyer obligations on PullBid Live: binding bids, payment, no chargeback abuse." }] }),
  component: Buyer,
});

function Buyer() {
  return (
    <LegalLayout title="Buyer Terms" updated="May 4, 2026">
      <p>By bidding, buying, or entering a giveaway on PullBid Live, you agree to the following:</p>

      <h2>1. Binding Bids</h2>
      <ul>
        <li><strong>All bids are final and binding.</strong> Placing a bid is a legal commitment to purchase the item if you are the highest bidder when the auction ends.</li>
        <li>Winning a Buy-Now or Mystery Break slot is also a binding purchase.</li>
        <li>Bids cannot be retracted except in cases of clear seller misrepresentation, subject to Platform review.</li>
      </ul>

      <h2>2. Payment</h2>
      <ul>
        <li>You must complete payment for all won items within the cart payment window.</li>
        <li>Payment is processed via Stripe. By paying, you authorize the charge to your selected payment method.</li>
        <li>Failure to pay may result in items being relisted, account suspension, and forfeiture of related giveaway prizes.</li>
      </ul>

      <h2>3. No Chargeback Abuse</h2>
      <ul>
        <li>Chargebacks must only be filed for genuine unauthorized transactions.</li>
        <li>Filing a fraudulent chargeback (e.g. claiming "item not received" after delivery confirmation) is grounds for permanent ban and may be reported to your card issuer and authorities.</li>
        <li>Item-quality disputes must go through the in-app dispute system <em>before</em> any chargeback.</li>
      </ul>

      <h2>4. Shipping & Delivery</h2>
      <ul>
        <li>You are responsible for providing an accurate shipping address.</li>
        <li>Combined-shipping caps (where offered) apply per seller, per stream.</li>
      </ul>

      <h2>5. Conduct in Live Streams</h2>
      <ul>
        <li>Follow chat slow-mode and host rules.</li>
        <li>No spam, harassment, or attempts to disrupt auctions.</li>
        <li>Hosts and moderators may mute, timeout, or ban you from a stream.</li>
      </ul>
    </LegalLayout>
  );
}
