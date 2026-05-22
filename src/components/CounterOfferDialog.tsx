/**
 * CounterOfferDialog — shared dialog for seller counters AND buyer counter-backs.
 * Forces an expiration window (1/2/6/12/24h). Each counter resets the timer.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  currentAmount: number;
  side: "seller" | "buyer";
  busy?: boolean;
  onSubmit: (amount: number, expiresInHours: number) => void;
  minAmount?: number;
}

export function CounterOfferDialog({
  open, onClose, title, currentAmount, side, busy, onSubmit, minAmount,
}: Props) {
  const [amount, setAmount] = useState<string>(String(currentAmount));
  const [hours, setHours] = useState<number>(24);

  const handle = () => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    if (minAmount && n < minAmount) return;
    onSubmit(n, hours);
  };

  const label =
    side === "seller" ? "Send counter to buyer" : "Send counter back to seller";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="counter-amt">Your counter price (USD)</Label>
            <Input
              id="counter-amt"
              type="number"
              inputMode="decimal"
              min={minAmount || 1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Current standing price: <b>${currentAmount.toFixed(2)}</b>
              {minAmount ? ` · Seller minimum: $${minAmount}` : ""}
            </p>
          </div>

          <div>
            <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Response window</Label>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {([1, 2, 6, 12, 24] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                    hours === h
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 hover:bg-muted"
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Each counter resets the timer. If the other side doesn't respond in time, the offer auto-expires and the buyer's card authorization is released.
            </p>
          </div>

          {side === "buyer" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
              Countering re-authorizes your card at the new amount. Your previous authorization will be released automatically.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handle} disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…</> : label}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
