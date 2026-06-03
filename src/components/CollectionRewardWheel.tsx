import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpinWheel, type WheelSlot } from "@/components/SpinWheel";
import { getCollectionWheel, spinCollectionWheel } from "@/lib/wheel.functions";
import { Lock, Sparkles, Gift, Trophy, Coins, Star, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Won = Awaited<ReturnType<typeof spinCollectionWheel>>;

const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};
const RARITY_CLASS: Record<string, string> = {
  common: "text-slate-400 border-slate-400/40",
  rare: "text-blue-400 border-blue-400/40",
  epic: "text-purple-400 border-purple-400/40",
  legendary: "text-amber-400 border-amber-400/50",
};

const SPIN_MS = 4500;

export function CollectionRewardButton({
  setKey,
  setName,
  complete,
}: {
  setKey: string;
  setName: string;
  complete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const getWheel = useServerFn(getCollectionWheel);
  const wheelQ = useQuery({
    queryKey: ["collection-wheel"],
    queryFn: () => getWheel(),
  });

  const alreadySpun = useMemo(
    () => (wheelQ.data?.spunKeys ?? []).includes(setKey),
    [wheelQ.data, setKey],
  );

  let label = "Locked";
  let icon = <Lock className="mr-1.5 h-4 w-4" />;
  if (alreadySpun) {
    label = "Reward Claimed";
    icon = <CheckCircle2 className="mr-1.5 h-4 w-4" />;
  } else if (complete) {
    label = "Spin Reward Wheel";
    icon = <Sparkles className="mr-1.5 h-4 w-4" />;
  }

  return (
    <>
      <Button
        size="sm"
        className="h-9 w-full sm:w-auto"
        variant={complete && !alreadySpun ? "default" : "secondary"}
        disabled={!complete && !alreadySpun}
        onClick={() => setOpen(true)}
      >
        {icon}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" /> {setName} — Reward Wheel
            </DialogTitle>
          </DialogHeader>
          <WheelBody
            setKey={setKey}
            setName={setName}
            complete={complete}
            alreadySpun={alreadySpun}
            slots={wheelQ.data?.slots ?? []}
            wonExisting={(wheelQ.data?.spins ?? []).find((s) => s.contextKey === setKey) ?? null}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function WheelBody({
  setKey,
  setName,
  complete,
  alreadySpun,
  slots,
  wonExisting,
}: {
  setKey: string;
  setName: string;
  complete: boolean;
  alreadySpun: boolean;
  slots: Awaited<ReturnType<typeof getCollectionWheel>>["slots"];
  wonExisting: Awaited<ReturnType<typeof getCollectionWheel>>["spins"][number] | null;
}) {
  const qc = useQueryClient();
  const spin = useServerFn(spinCollectionWheel);
  const [spinning, setSpinning] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishAt, setFinishAt] = useState<number | null>(null);
  const [won, setWon] = useState<Won | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const wheelSlots: WheelSlot[] = useMemo(
    () => slots.map((s) => ({ id: s.id, label: s.label, weight: s.weight, color: s.color, is_active: true })),
    [slots],
  );

  const doSpin = async () => {
    if (spinning) return;
    setSpinning(true);
    setWon(null);
    setCelebrate(false);
    try {
      const r = await spin({ data: { contextKey: setKey, contextLabel: setName } });
      setTarget(r.slotId);
      setStartedAt(Date.now());
      setFinishAt(Date.now() + SPIN_MS);
      // result revealed onLanded
      (window as any).__pendingWheelWin = r;
    } catch (e) {
      setSpinning(false);
      toast.error((e as Error).message);
    }
  };

  const onLanded = () => {
    const r: Won | undefined = (window as any).__pendingWheelWin;
    setSpinning(false);
    if (r) {
      setWon(r);
      setCelebrate(true);
      toast.success(`You won: ${r.label}!`);
      qc.invalidateQueries({ queryKey: ["collection-wheel"] });
      qc.invalidateQueries({ queryKey: ["rewards-overview"] });
    }
  };

  // Already-won view (persisted)
  const finalWon = won ?? (alreadySpun && wonExisting
    ? ({
        label: wonExisting.label,
        rarity: wonExisting.rarity,
        rewardKind: wonExisting.rewardKind,
        rewardSlug: wonExisting.rewardSlug,
        credits: wonExisting.credits,
        xp: wonExisting.xp,
        icon: wonExisting.icon,
      } as unknown as Won)
    : null);

  return (
    <div className="flex flex-col items-center gap-4">
      {finalWon && !spinning ? (
        <div className={`w-full rounded-xl border p-4 text-center ${celebrate ? "animate-scale-in" : ""} ${RARITY_CLASS[finalWon.rarity] ?? ""}`}>
          {celebrate && <div className="mb-1 text-3xl">🎉</div>}
          <Trophy className="mx-auto h-8 w-8" />
          <p className="mt-2 text-xs uppercase tracking-wide">{RARITY_LABEL[finalWon.rarity] ?? finalWon.rarity} reward</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{finalWon.label}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            {finalWon.credits > 0 && (
              <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5" /> +{finalWon.credits} credits</span>
            )}
            {finalWon.xp > 0 && (
              <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" /> +{finalWon.xp} XP</span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {alreadySpun || won ? "Added to your account. View it on your profile." : ""}
          </p>
        </div>
      ) : (
        <>
          <SpinWheel
            slots={wheelSlots}
            spinning={spinning}
            targetSlotId={target}
            startedAt={startedAt}
            finishAt={finishAt}
            size={240}
            onLanded={onLanded}
          />
          {complete ? (
            <Button className="w-full" disabled={spinning} onClick={doSpin}>
              <Sparkles className="mr-1.5 h-4 w-4" /> {spinning ? "Spinning…" : "Spin Reward Wheel"}
            </Button>
          ) : (
            <div className="w-full rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              <Lock className="mx-auto mb-1 h-4 w-4" />
              Complete this set 100% to unlock your spin. Here's what you could win:
            </div>
          )}
        </>
      )}

      {/* Reward pool preview — always visible */}
      <div className="w-full">
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Possible rewards · you always win something</p>
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s) => (
            <Badge key={s.id} variant="outline" className={`text-[10px] ${RARITY_CLASS[s.rarity] ?? ""}`}>
              {s.label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
