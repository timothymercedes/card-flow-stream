import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/LegalLayout";

export const Route = createFileRoute("/legal/important-notice")({
  head: () => ({
    meta: [
      { title: "Important Notice — PullBid Live" },
      { name: "description", content: "Key platform rules, fees, shipping responsibilities, and protections every PullBid Live user should know." },
    ],
  }),
  component: ImportantNotice,
});

function ImportantNotice() {
  return (
    <LegalLayout title="Important Notice" updated="May 15, 2026">
      <p>
        This notice summarizes the most important rules, fees, and responsibilities for using PullBid Live.
        Please read it carefully — your acceptance is required to bid, sell, host livestreams, or check out.
      </p>

      <h2>1. International Shipping & Customs</h2>
      <ul>
        <li>Buyers are responsible for any <strong>customs duties, import taxes, or VAT</strong> charged by their country.</li>
        <li>A <strong>4% international processing fee</strong> applies when buyer or seller is outside the USA, to cover cross-border card processing, FX, and dispute exposure.</li>
        <li>International shipping times are not guaranteed. Customs delays are not the seller's or platform's responsibility.</li>
        <li>Refused or unclaimed packages are non-refundable beyond the original item value.</li>
      </ul>

      <h2>2. Platform & Payment Processing Fees</h2>
      <ul>
        <li>Buyers pay a fixed <strong>$1.23 platform fee</strong> per marketplace purchase to help offset payment processing.</li>
        <li>Tips and shoutouts are subject to a <strong>10% platform fee</strong>.</li>
        <li>Standard card processing fees (~2.9% + $0.30) apply via our payment provider on top of any platform fees.</li>
        <li>Promotion / discoverability boosts are paid directly to the platform and are non-refundable once the boost begins.</li>
      </ul>

      <h2>3. Seller Responsibilities</h2>
      <ul>
        <li>Ship within the time window stated on your listing or live show. Late shipments may trigger automatic refunds and seller penalties.</li>
        <li>Use accurate condition grading. Misrepresentation = dispute lost + possible suspension.</li>
        <li>Provide tracking on every shipment over the platform-defined threshold.</li>
        <li>Honor every winning bid. Auctions are binding contracts.</li>
        <li>Maintain a verified Stripe Connect account to receive payouts.</li>
      </ul>

      <h2>4. Buyer Protection</h2>
      <ul>
        <li>Items not received, significantly not-as-described, or damaged in transit are eligible for the in-app dispute process.</li>
        <li>Disputes must be opened within <strong>7 days of delivery</strong> (or 30 days from purchase if never delivered).</li>
        <li>Provide clear photos and tracking evidence — disputes without evidence will be denied.</li>
      </ul>

      <h2>5. Refund & Dispute Policy</h2>
      <ul>
        <li>Refunds are issued back to the original payment method, minus non-recoverable processing fees.</li>
        <li>Decisions made by PullBid Live moderators are final once both parties have presented evidence.</li>
        <li>Mystery breaks, slabs marked "as-is", and digital items are <strong>final sale</strong> unless the seller misrepresented them.</li>
      </ul>

      <h2>6. Prohibited Items</h2>
      <ul>
        <li>Counterfeit, reprinted, or "proxy" cards sold as authentic.</li>
        <li>Stolen goods or items you do not have legal authority to sell.</li>
        <li>Adult content, weapons, regulated substances, hate-symbol merchandise.</li>
        <li>Anything that violates US, EU, or destination-country law.</li>
      </ul>

      <h2>7. Chargeback Abuse</h2>
      <ul>
        <li>Filing a chargeback instead of an in-app dispute is treated as <strong>payment abuse</strong> and may result in immediate ban.</li>
        <li>Friendly-fraud chargebacks are reported to card networks and our processor's fraud database.</li>
      </ul>

      <h2>8. Shipping Deadlines</h2>
      <ul>
        <li>Standard ship-by window: <strong>3 business days</strong> from order confirmation, unless your listing states otherwise.</li>
        <li>Live show wins: <strong>5 business days</strong> from end of show to allow for invoice consolidation.</li>
        <li>Repeated late shipments lower your seller score and may demote your shows.</li>
      </ul>

      <h2>9. Auction Rules</h2>
      <ul>
        <li>All bids are binding. You cannot retract a bid once placed.</li>
        <li>Snipe-extension rules (e.g. last-10-second bids extend the timer) are set per show by the host.</li>
        <li>Shill bidding, collusion with other bidders, and "running up" friends' auctions = permanent ban.</li>
        <li>Winning bidders must complete payment within the show's stated checkout window.</li>
      </ul>

      <h2>10. Digital Items & Liability Disclaimers</h2>
      <ul>
        <li>Digital codes, redemption tickets, and other intangible items are sold AS-IS — once delivered, no refund.</li>
        <li>The platform does not guarantee uninterrupted streaming, bid delivery, or notification timing. Network issues, blackouts, and force-majeure events are not grounds for compensation.</li>
        <li>Pricing data, AI scanner results, and grading lookups are estimates only — not appraisals.</li>
      </ul>

      <h2>11. Account Suspension Reasons</h2>
      <ul>
        <li>Fraud, fakes, shill bidding, payment abuse, chargeback abuse.</li>
        <li>Harassment, hate speech, threats, doxxing, or sexual content in chat or DMs.</li>
        <li>Off-platform deals to circumvent fees.</li>
        <li>Repeated late shipments, no-pays, or unresolved disputes.</li>
        <li>Multiple accounts or evading a prior ban.</li>
      </ul>

      <h2>12. Updates to This Notice</h2>
      <p>
        When this notice or our other agreements change in a material way, you will be asked to re-accept on your next sign-in.
        Continuing to use PullBid Live after an update means you accept the latest version.
      </p>

      <h2>Contact</h2>
      <p>Questions: <a href="mailto:support@pullbidlive.com" className="text-primary underline">support@pullbidlive.com</a></p>
    </LegalLayout>
  );
}
