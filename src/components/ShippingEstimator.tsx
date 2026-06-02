import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { estimateShippoRates } from "@/lib/shippo.functions";
import { Truck, Globe2, Loader2 } from "lucide-react";
import { SHIPPING_PRESETS, type ShippingPresetKey } from "@/lib/shippingPresets";
import { estimateShippingAndImportFees } from "@/lib/shippingEstimate";

type Props = {
  sellerId: string;
  presetKey?: ShippingPresetKey | null;
  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  buyerCountry?: string | null;
  buyerZip?: string | null;
  /** Subtotal in USD — only used for the offline fallback */
  subtotalUsd?: number;
  /** Render as a single inline line instead of full card */
  compact?: boolean;
  className?: string;
  /** Notify parent of the chosen amount (USD) so totals can include it. */
  onResolved?: (info: { amountUsd: number; isInternational: boolean; carrier?: string; service?: string }) => void;
};

type EstimateResult = {
  ok: boolean;
  amountUsd: number;
  carrier?: string;
  service?: string;
  isInternational: boolean;
  source: "shippo" | "flat" | "fallback";
  message?: string;
};

export function ShippingEstimator({
  sellerId,
  presetKey,
  weightOz,
  lengthIn,
  widthIn,
  heightIn,
  buyerCountry,
  buyerZip,
  subtotalUsd = 0,
  compact = false,
  className = "",
  onResolved,
}: Props) {
  const estimate = useServerFn(estimateShippoRates);
  const [state, setState] = useState<{ loading: boolean; error?: string; result?: EstimateResult }>({ loading: true });

  const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    if (!isUuid(sellerId)) {
      const fb = estimateShippingAndImportFees({
        subtotal: subtotalUsd,
        buyerCountry: buyerCountry || "US",
        sellerCountry: "US",
        weightOz: weightOz ?? SHIPPING_PRESETS[(presetKey || "bubble") as ShippingPresetKey]?.weightOz ?? 4,
      });
      const result: EstimateResult = {
        ok: true,
        amountUsd: fb.shipping,
        isInternational: !fb.domestic,
        source: "fallback",
      };
      setState({ loading: false, result });
      onResolved?.({ amountUsd: result.amountUsd, isInternational: result.isInternational });
      return () => { cancelled = true; };
    }
    const t = setTimeout(async () => {

      try {
        const r = await estimate({
          data: {
            sellerId,
            presetKey: presetKey || undefined,
            weightOz: weightOz ?? undefined,
            lengthIn: lengthIn ?? undefined,
            widthIn: widthIn ?? undefined,
            heightIn: heightIn ?? undefined,
            buyerCountry: buyerCountry ?? undefined,
            buyerZip: buyerZip ?? undefined,
          },
        });
        if (cancelled) return;
        const result: EstimateResult = {
          ok: true,
          amountUsd: r.amountUsd,
          carrier: r.carrier,
          service: r.service,
          isInternational: r.isInternational,
          source: r.source as any,
          message: r.message,
        };
        setState({ loading: false, result });
        onResolved?.({ amountUsd: result.amountUsd, isInternational: result.isInternational, carrier: result.carrier, service: result.service });
      } catch (e: any) {
        if (cancelled) return;
        // Offline fallback
        const fb = estimateShippingAndImportFees({
          subtotal: subtotalUsd,
          buyerCountry: buyerCountry || "US",
          sellerCountry: "US",
          weightOz: weightOz ?? SHIPPING_PRESETS[(presetKey || "bubble") as ShippingPresetKey]?.weightOz ?? 4,
        });
        const result: EstimateResult = {
          ok: true,
          amountUsd: fb.shipping,
          isInternational: !fb.domestic,
          source: "fallback",
          message: e?.message || "Using estimate",
        };
        setState({ loading: false, result, error: e?.message });
        onResolved?.({ amountUsd: result.amountUsd, isInternational: result.isInternational });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sellerId, presetKey, weightOz, lengthIn, widthIn, heightIn, buyerCountry, buyerZip]);

  if (state.loading) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" /> Checking carrier rates…
      </span>
    );
  }

  const r = state.result!;
  const Icon = r.isInternational ? Globe2 : Truck;
  const amount = `$${r.amountUsd.toFixed(2)}`;
  const label = r.source === "flat"
    ? "Flat-rate"
    : r.source === "fallback"
      ? "Estimated"
      : `${r.carrier ?? "Carrier"} · ${r.service ?? "Cheapest"}`;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs ${className}`} title={label}>
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="font-bold">{amount}</span>
        <span className="text-muted-foreground truncate">{label}</span>
      </span>
    );
  }

  return (
    <div className={`rounded-lg bg-muted/40 p-2 text-xs ${className}`}>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {r.isInternational ? "International shipping" : "Domestic shipping"}
        </span>
        <span className="font-bold">{amount}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {label}
        {r.source === "shippo" && " · live carrier rate"}
        {r.source === "fallback" && " · carrier API unavailable, showing estimate"}
        {r.isInternational && " · customs/VAT may apply on delivery"}
      </p>
    </div>
  );
}
