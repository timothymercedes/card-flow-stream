/**
 * OfferDialog — binding-commitment make-an-offer modal.
 *
 * - Requires a saved card on file (delegates to useRequireCardOnFile).
 * - Shows binding commitment + final-sale + 24h expiration notice.
 * - Records policy acceptance and calls createOffer (pre-authorizes card).
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, Clock, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRequireCardOnFile } from "@/hooks/useRequireCardOnFile";
import { useAuthGate } from "@/hooks/useAuthGate";
import { createOffer } from "@/lib/createOffer.functions";
import { recordPolicyAcceptance } from "@/lib/policy.functions";
import { FINAL_SALE_POLICY_VERSION } from "@/lib/policy";

interface Props {
  open: boolean;
  onClose: () => void;
  queueItemId: string;
  itemTitle: string;
  minOffer?: number | null;
  suggestedPrice?: number | null;
  onSubmitted?: (offerId: string) => void;
}

export function OfferDialog({
  open,
  onClose,
  queueItemId,
  itemTitle,
  minOffer,
  suggestedPrice,
  onSubmitted,
}: Props) {
  const { requireAuth } = useAuthGate();
  const { requireCard, Modal: CardModal } = useRequireCardOnFile();
  const submitOffer = useServerFn(createOffer);
  const recordPolicy = useServerFn(recordPolicyAcceptance);

  const [amount, setAmount] = useState<string>(suggestedPrice ? String(suggestedPrice) : "");
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const handleSubmit = async () => {
    if (!requireAuth("offer")) return;
    if (!requireCard()) return;
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("Enter a valid amount"); return; }
    if (minOffer && n < minOffer) { toast.error(`Minimum offer is $${minOffer}`); return; }
    if (!acknowledged) { toast.error("Please confirm you understand the binding commitment"); return; }

    setBusy(true);
    try {
      const res = await submitOffer({ data: { queueItemId, amount: n, expiresInHours } });
      await recordPolicy({
        data: {
          context: "offer_accept",
          metadata: { offer_id: (res as any).offerId, amount: n, queue_item_id: queueItemId, expires_in_hours: expiresInHours },
        },
      }).catch(() => {});
      toast.success("Offer submitted — card authorized");
      onSubmitted?.((res as any).offerId);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to submit offer");
    } finally {
      setBusy(false);
    }
  };

  const durationLabel = expiresInHours === 1 ? "1 hour" : `${expiresInHours} hours`;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Make an offer on {itemTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="offer-amt">Your offer (USD)</Label>
              <Input
                id="offer-amt"
                type="number"
                inputMode="decimal"
                min={minOffer || 1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={minOffer ? `Min $${minOffer}` : "Enter amount"}
              />
              {minOffer ? (
                <p className="mt-1 text-[11px] text-muted-foreground">Seller minimum: ${minOffer}</p>
              ) : null}
            </div>

            <div>
              <Label>Offer expires in</Label>
              <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                {([1, 2, 6, 12, 24] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setExpiresInHours(h)}
                    className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                      expiresInHours === h
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Shorter windows push sellers to respond faster. Default is 24 hours.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold">Binding purchase commitment</p>
                  <p>Submitting an offer is a binding purchase commitment if accepted by the seller.</p>
                </div>
              </div>
              <ul className="ml-6 list-disc space-y-1">
                <li className="flex items-start gap-1"><CreditCard className="h-3 w-3 mt-0.5" /> Your card will be <b>pre-authorized</b> for ${amount || "—"} (not yet charged).</li>
                <li className="flex items-start gap-1"><Clock className="h-3 w-3 mt-0.5" /> Offer expires automatically in <b>{durationLabel}</b>.</li>
                <li>You can cancel <b>only before</b> the seller accepts.</li>
                <li>Once accepted, payment captures immediately and the sale is final.</li>
              </ul>
            </div>

            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand this is a binding commitment and agree to the Final Sale &amp; Buyer
                Protection policy (v{FINAL_SALE_POLICY_VERSION}).
              </span>
            </label>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={busy || !acknowledged}>
                {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Authorizing…</> : "Submit binding offer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {CardModal}
    </>
  );
}
