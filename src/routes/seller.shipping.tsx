import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { SellerShippingQueue } from "@/components/SellerShippingQueue";
import { SellerVerificationGate } from "@/components/SellerVerificationGate";

export const Route = createFileRoute("/seller/shipping")({
  head: () => ({ meta: [
    { title: "Shipping prep — PullBid Live" },
    { name: "description", content: "Scan, pack, and prep orders for dropoff." },
  ] }),
  component: ShippingPage,
});

function ShippingPage() {
  return (
    <SellerVerificationGate>
      <AppShell>
        <div className="px-4 py-4">
          <SellerShippingQueue />
        </div>
      </AppShell>
    </SellerVerificationGate>
  );
}
