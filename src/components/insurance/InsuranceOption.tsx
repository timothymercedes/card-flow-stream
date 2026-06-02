import { useEffect, useState } from "react";
import { Shield, Check, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { quoteInsurance, attachInsuranceAtCheckout } from "@/lib/insurance.functions";
import { toast } from "sonner";

interface Props {
  orderIds: string[];
  /** Combined subtotal cents to estimate coverage and fee */
  subtotalCents: number;
  onChange?: (insuranceFeeCents: number, coverageCents: number) => void;
}

export function InsuranceOption({ orderIds, subtotalCents, onChange }: Props) {
  const quoteFn = useServerFn(quoteInsurance);
  const attachFn = useServerFn(attachInsuranceAtCheckout);
  const [optIn, setOptIn] = useState(false);
  const [feeCents, setFeeCents] = useState(0);
  const [coverage, setCoverage] = useState(subtotalCents);
  const [loading, setLoading] = useState(false);
  const [estDays, setEstDays] = useState(10);

  useEffect(() => {
    setCoverage(subtotalCents);
    quoteFn({ data: { coverageCents: subtotalCents } })
      .then((q) => { setFeeCents(q.feeCents); setEstDays(q.estResolutionDays); })
      .catch(() => {});
  }, [subtotalCents]);

  async function toggle(next: boolean) {
    setOptIn(next);
    setLoading(true);
    try {
      await Promise.all(orderIds.map((id) =>
        attachFn({ data: { orderId: id, optIn: next, coverageCents: coverage } }),
      ));
      onChange?.(next ? feeCents * orderIds.length : 0, next ? coverage : 0);
      if (next) toast.success("Shipment protected");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update insurance");
      setOptIn(!next);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => toggle(e.target.checked)}
          disabled={loading}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">Protect this shipment</span>
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Coverage: <strong>${(coverage / 100).toFixed(2)}</strong> · Cost{" "}
            <strong>${(feeCents / 100).toFixed(2)}</strong>
          </p>
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            <li className="flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Lost packages</li>
            <li className="flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Damaged in transit</li>
            <li className="flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> Avg. resolution {estDays} days</li>
          </ul>
        </div>
      </label>
    </div>
  );
}
