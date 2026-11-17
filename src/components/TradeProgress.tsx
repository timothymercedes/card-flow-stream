import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { listMyTrades, updateTradeProgress } from "@/lib/trades.functions";
import { oppositeSide } from "@/lib/tradeRules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, CheckCircle2, Flag } from "lucide-react";

type Trade = Awaited<ReturnType<typeof listMyTrades>>[number];
export function TradeProgress({ trade: t, refresh, readOnly = false }: { trade: Trade; refresh: () => void; readOnly?: boolean }) {
  const mine = t.role === "outgoing" ? "from" : "to";
  const other = oppositeSide(mine);
  const [carrier, setCarrier] = useState(t[`${mine}_carrier`] ?? "");
  const [tracking, setTracking] = useState(t[`${mine}_tracking`] ?? "");
  const [receipt, setReceipt] = useState(false);
  const [report, setReport] = useState(false);
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState("");
  const fn = useServerFn(updateTradeProgress);
  const mut = useMutation({
    mutationFn: (data: { tradeId: string; action: "ship" | "receive" | "issue" | "resolve_issue"; carrier?: string; tracking?: string; body?: string; issueId?: string }) => fn({ data }),
    onSuccess: (_result, data) => { setSaved(data.action === "issue" ? "Issue report saved privately. Cards remain locked." : "Saved"); setReceipt(false); setReport(false); setBody(""); refresh(); },
  });
  const busy = mut.isPending;
  const myCards = t.items.some((i: any) => i.owner_side === mine);
  const theirCards = t.items.some((i: any) => i.owner_side === other);
  return <div className="w-full space-y-3 border-t pt-3">
    <div className="grid gap-3 sm:grid-cols-2">
      {([mine, other] as const).map((side) => <div key={side} className="min-w-0 space-y-1 text-sm">
        <p className="font-semibold">{side === mine ? "Your shipment" : "Their shipment"}</p>
        <p className="text-muted-foreground">{t.items.some((i: any) => i.owner_side === side) ? t[`${side}_shipped_at`] ? `Shipped ${new Date(t[`${side}_shipped_at`]).toLocaleString()}` : "Not shipped yet" : "No cards to ship"}</p>
        {t[`${side}_tracking`] && <p className="break-all">{t[`${side}_carrier`]} · {t[`${side}_tracking`]}</p>}
        <p>{t[`${oppositeSide(side)}_received_at`] ? "Receipt confirmed" : "Receipt not confirmed"}</p>
      </div>)}
    </div>
    {t.has_unresolved_issue && <p className="text-sm text-destructive" role="status">Unresolved issue — completion paused; cards remain locked.</p>}
    {!readOnly && myCards && !t[`${other}_received_at`] && <div className="flex flex-wrap gap-2">
      <Input aria-label="Your carrier" placeholder="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={80} disabled={busy} className="sm:w-36" />
      <Input aria-label="Your tracking number" placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={120} disabled={busy} className="sm:w-52" />
      <Button size="sm" disabled={busy || carrier.trim().length < 2 || tracking.trim().length < 3} onClick={() => mut.mutate({ tradeId: t.id, action: "ship", carrier, tracking })}><Truck className="mr-1 h-4 w-4" />Save shipment</Button>
    </div>}
    {!readOnly && <div className="flex flex-wrap gap-2">
      {theirCards && <Button size="sm" variant="outline" disabled={busy || !t[`${other}_shipped_at`] || !!t[`${mine}_received_at`]} onClick={() => setReceipt(true)}><CheckCircle2 className="mr-1 h-4 w-4" />{t[`${mine}_received_at`] ? "Receipt confirmed" : "Confirm received cards"}</Button>}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReport(true)}><Flag className="mr-1 h-4 w-4" />Report an issue</Button>
    </div>}
    {t.my_issues.map((i: { id: string; body: string; resolved_at: string | null }) => <div key={i.id} className="space-y-1 text-sm"><p className="break-words">Your private report: {i.body}</p><p className="text-muted-foreground">{i.resolved_at ? "Resolved" : "Saved · unresolved"}</p>{!readOnly && !i.resolved_at && <Button size="sm" variant="outline" disabled={busy} onClick={() => mut.mutate({ tradeId: t.id, action: "resolve_issue", issueId: i.id })}>Mark my issue resolved</Button>}</div>)}
    {saved && <p role="status" className="text-sm text-primary">{saved}</p>}
    {mut.error && <p role="alert" className="text-sm text-destructive">{mut.error.message}</p>}
    <Dialog open={receipt} onOpenChange={setReceipt}><DialogContent><DialogHeader><DialogTitle>Confirm receipt of their cards?</DialogTitle></DialogHeader><p>You confirm that you received the opposite participant’s cards. Your shipment still needs their separate confirmation.</p><DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setReceipt(false)}>Cancel</Button><Button disabled={busy} onClick={() => mut.mutate({ tradeId: t.id, action: "receive" })}>Confirm receipt</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={report} onOpenChange={setReport}><DialogContent><DialogHeader><DialogTitle>Report a trade issue</DialogTitle></DialogHeader><Textarea aria-label="Issue details" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Describe the issue" /><p className="text-sm text-muted-foreground">Your report is private. Completion is paused until you resolve it.</p>{mut.error && <p role="alert">{mut.error.message}</p>}<DialogFooter><Button variant="ghost" disabled={busy} onClick={() => setReport(false)}>Cancel</Button><Button disabled={busy || body.trim().length < 10} onClick={() => mut.mutate({ tradeId: t.id, action: "issue", body })}>Save issue report</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}