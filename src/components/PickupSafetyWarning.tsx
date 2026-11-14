import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const PICKUP_RULES = [
  "All purchases must be paid through PullBid Live checkout.",
  "Do not pay sellers through Cash App, Zelle, Venmo, cash, or any other outside payment method.",
  "Keep every message about this purchase on PullBid Live.",
  "Use the official pickup verification code when you meet.",
  "Off-platform transactions may not receive platform protection or dispute help.",
];

/** Mandatory acknowledgment before confirming Local Pickup. */
export function PickupSafetyWarning({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOk(false); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" /> Before you choose Local Pickup</DialogTitle>
          <DialogDescription>Stay protected by keeping payment on PullBid Live.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm">{PICKUP_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        <label className="flex min-h-11 items-start gap-3 text-sm font-medium">
          <Checkbox checked={ok} onCheckedChange={(v) => setOk(v === true)} aria-label="I understand the pickup rules" className="mt-0.5" />
          I understand and will pay only through PullBid Live checkout.
        </label>
        <DialogFooter>
          <Button variant="secondary" className="min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="min-h-11" disabled={!ok} onClick={() => { onConfirm(); setOk(false); }}>Confirm Local Pickup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
