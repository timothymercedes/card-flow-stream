import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/seller-agreement")({
  head: () => ({ meta: [{ title: "Seller Agreement — PullBid Live" }, { name: "description", content: "Seller obligations on PullBid Live: shipping, accurate listings, no counterfeits." }] }),
  component: Seller,
});

function Seller() {
  return (
    <LegalLayout title="Seller Agreement" updated="May 4, 2026">
      <p>This Seller Agreement applies to every approved seller on PullBid Live. By being approved as a seller, you agree to the following in addition to the general Terms of Service.</p>

      <h2>1. Shipping Obligations</h2>
      <ul>
        <li>Ship paid orders within <strong>3 business days</strong> of payment unless a longer timeframe is clearly stated on the listing.</li>
        <li>Provide a valid tracking number through the order page within 24 hours of shipment.</li>
        <li>Use packaging appropriate for the item (toploader/sleeve for cards, bubble mailer minimum, rigid mailer for high-value).</li>
        <li>Combined-shipping caps must be honored when buyers win multiple items in the same stream.</li>
      </ul>

      <h2>2. Listing Accuracy</h2>
      <ul>
        <li>All listings must accurately describe the item: title, set, year, card number, and condition (NM, LP, MP, Damaged).</li>
        <li>Front and back photos must be of the actual item, well-lit, and unedited beyond cropping/brightness.</li>
        <li>Disclose any flaws, alterations, or restoration.</li>
        <li>AI-assisted identification does not transfer responsibility — you are accountable for what you list.</li>
      </ul>

      <h2>3. No Counterfeits or Fakes</h2>
      <ul>
        <li>Selling counterfeit, reproduction, proxy, or knowingly altered items is strictly prohibited.</li>
        <li>Violation results in immediate permanent ban, payout freeze, and potential reporting to authorities.</li>
      </ul>

      <h2>4. Order Fulfillment</h2>
      <ul>
        <li>You are responsible for fulfilling every paid order. Cancelling without buyer agreement may incur penalties.</li>
        <li>If an item is lost or damaged in transit, you must work with the buyer to resolve (refund or replacement).</li>
        <li>Refunds for valid disputes must be processed promptly.</li>
      </ul>

      <h2>5. Live Stream Conduct</h2>
      <ul>
        <li>Run auctions fairly. No shill bidding, fake bidders, or collusion.</li>
        <li>Honor stated giveaway rules and announced winners.</li>
        <li>Maintain a respectful environment in chat. You are responsible for your moderators.</li>
      </ul>

      <h2>6. Fees & Payouts</h2>
      <ul>
        <li>The Platform deducts a commission (default 5%) from each completed sale. Stripe payment processing fees also apply.</li>
        <li>Payouts are sent to your connected Stripe account on the standard payout schedule.</li>
        <li>Payouts may be held pending dispute resolution or suspected fraud.</li>
      </ul>

      <h2>7. Suspension & Removal</h2>
      <ul>
        <li>The Platform may, at its sole discretion, suspend or permanently remove sellers for violations including but not limited to: late shipments, fakes, inaccurate listings, fraudulent auction conduct, chargeback rates above threshold, or harassment.</li>
        <li>Removed sellers forfeit pending payouts only where required to satisfy buyer refunds and chargebacks.</li>
      </ul>

      <h2>8. Tax & Legal Compliance</h2>
      <p>You are solely responsible for collecting and remitting any applicable sales tax, VAT, and reporting income from sales on the Platform.</p>
    </LegalLayout>
  );
}
