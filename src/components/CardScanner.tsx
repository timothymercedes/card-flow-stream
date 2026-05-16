import { useEffect, useRef, useState } from "react";
import {
  Camera,
  RefreshCw,
  X,
  Loader2,
  Check,
  Pencil,
  Layers,
  Square,
  CheckSquare,
  Sparkles,
  Search,
  Package,
  Tag,
  Gavel,
  Save,
  AlertTriangle,
  ImageIcon,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ManualCardFinder, type FinderCard } from "@/components/ManualCardFinder";
import { categoryToGameId } from "@/lib/scannerGame";

export type ScanAlternative = {
  name: string;
  set?: string;
  year?: string;
  tcg_number?: string;
  variant?: string;
  rarity?: string;
  estimated_value?: number;
  image_url?: string;
};

export type ScanResult = {
  name: string;
  category: string;
  set?: string;
  year?: string;
  tcg_number?: string;
  variant?: string;
  rarity?: string;
  language?: string;
  game_specific?: Record<string, string>;
  estimated_value?: number;
  condition_prices?: { NM?: number; LP?: number; MP?: number; Damaged?: number };
  price_source?: string;
  price_source_url?: string;
  price_low?: number;
  price_high?: number;
  trend: string;
  image: string;
  reference_image?: string;
  confidence?: {
    name?: number;
    set?: number;
    year?: number;
    tcg_number?: number;
    variant?: number;
  };
  overall_confidence?: number;
  match_label?: string;
  alternatives?: ScanAlternative[];
  scan_debug?: {
    ocr_raw?: any;
    price_debug?: any;
    enrichment?: {
      trustedDatabaseIdentity: boolean;
      setReliable: boolean;
      numberReliable: boolean;
      reason: string;
      params: Record<string, string>;
    };
  };
};

export type ScanAction = "inventory" | "list" | "auction" | "offer" | "draft";

const LANGUAGES = [
  { v: "auto", l: "Auto" },
  { v: "en", l: "English" },
  { v: "jp", l: "Japanese" },
  { v: "kr", l: "Korean" },
  { v: "zh", l: "Chinese" },
  { v: "de", l: "German" },
  { v: "fr", l: "French" },
  { v: "es", l: "Spanish" },
  { v: "it", l: "Italian" },
  { v: "pt", l: "Portuguese" },
  { v: "ru", l: "Russian" },
] as const;

type Props = {
  onResult: (r: ScanResult) => void;
  onResults?: (rs: ScanResult[]) => void; // optional batch handler (multi-card)
  onClose: () => void;
  defaultLanguage?: string;
  allowMulti?: boolean; // shows the multi-card toggle (default true)
  /** Optional quick-action menu shown on the confirm screen. */
  onAction?: (action: ScanAction, result: ScanResult) => void;
  /** Optional callback when user taps "Find correct card" (manual finder). */
  onFindCorrect?: (current: ScanResult) => void;
  /** Live-stream mode: hides inventory/list/draft actions, shows a single
   *  "Go Live with This Card" button that calls onResult. */
  liveMode?: boolean;
};

export function CardScanner({
  onResult,
  onResults,
  onClose,
  defaultLanguage = "auto",
  allowMulti = true,
  onAction,
  onFindCorrect,
  liveMode = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(defaultLanguage);

  // Multi-card mode
  const [multi, setMulti] = useState(false);
  const [batch, setBatch] = useState<ScanResult[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Confirm-before-save (single)
  const [pending, setPending] = useState<ScanResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);

  // Photo Scan Mode — captured/uploaded image shown immediately while AI runs
  const [captured, setCaptured] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual capture only — user explicitly taps the shutter or picks a file.
  const capturingRef = useRef(false);

  function stopScannerCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }

  async function start(mode: "environment" | "user") {
    setError(null);
    try {
      stopScannerCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (err: any) {
          // Ignore AbortError / "interrupted" errors caused by rapid effect
          // re-runs (camera flip, unmount). Surface real failures only.
          if (
            err?.name !== "AbortError" &&
            !/interrupted|removed from the document/i.test(err?.message || "")
          ) {
            throw err;
          }
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setError(e?.message || "Camera unavailable. Check permissions.");
    }
  }

  useEffect(() => {
    if (pending || batch || captured) return;
    start(facing);
    return () => {
      stopScannerCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, pending, batch, captured]);

  function conditionPricesForMarket(market: number, raw?: any) {
    const nm = Number(raw?.conditions?.["Near Mint"] ?? market) || 0;
    return {
      NM: Math.round(nm * 100) / 100,
      LP: Math.round(Number(raw?.conditions?.["Lightly Played"] ?? nm * 0.85) * 100) / 100,
      MP: Math.round(Number(raw?.conditions?.["Moderately Played"] ?? nm * 0.6) * 100) / 100,
      Damaged: Math.max(
        0.5,
        Math.round(
          Number(raw?.conditions?.["Damaged"] ?? raw?.conditions?.["Heavily Played"] ?? nm * 0.25) *
            100,
        ) / 100,
      ),
    };
  }

  async function enrichWithMarketPrice(result: ScanResult): Promise<ScanResult> {
    const hasEnoughId = !!result.name && result.name !== "Unknown Card";
    if (!hasEnoughId) return result;
    const gameId = categoryToGameId(result.category);
    try {
      // Non-Pokémon cards: route directly through the game-aware card-price
      // aggregator (Scryfall / YGOPRODeck / local tcg_prices / PriceCharting
      // when enabled). The Pokémon-only refresh-prices path stays as-is below.
      if (gameId !== "pokemon") {
        return await enrichNonPokemon(result, gameId);
      }
      const params = new URLSearchParams({ name: result.name });
      const overall = result.overall_confidence ?? 0;
      const setReliable = (result.confidence?.set ?? 0) >= 0.85 && overall >= 0.75;
      const numberReliable = (result.confidence?.tcg_number ?? 0) >= 0.9 && overall >= 0.85;
      // A bad OCR card number was forcing exact DB hits for the wrong printing
      // (ex: #021 instead of #118). Only use set/number as hard lookup hints when
      // the model was actually confident in those fields.
      if (result.set && setReliable) params.set("set", result.set);
      if (result.tcg_number && numberReliable) params.set("number", result.tcg_number);
      params.set("scanConfidence", String(overall || 0));
      const rarityConf = result.confidence?.variant ?? result.confidence?.set ?? 0;
      if (result.rarity && rarityConf >= 0.85) params.set("rarity", result.rarity);
      if (result.variant && (result.confidence?.variant ?? 0) >= 0.85)
        params.set("variant", result.variant);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-prices?${params}`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const j = await r.json();
      const paramsRecord: Record<string, string> = {};
      params.forEach((v, k) => { paramsRecord[k] = v; });
      if (j?.price?.market == null) {
        // Fallback: hit the new multi-source aggregator (PokémonTCG + TCGdex + PriceCharting)
        let aggregated: any = null;
        try {
          const ar = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/card-price`,
            {
              method: "POST",
              headers: {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${token}`,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                name: result.name,
                set: setReliable ? result.set : undefined,
                number: numberReliable ? result.tcg_number : undefined,
              }),
            },
          );
          aggregated = await ar.json();
        } catch (e) {
          aggregated = { error: String((e as any)?.message || e) };
        }
        const aggMarket = Number(aggregated?.price?.market);
        if (Number.isFinite(aggMarket) && aggMarket > 0 && setReliable && numberReliable) {
          return {
            ...result,
            estimated_value: aggMarket,
            price_source: aggregated?.primary_source || "aggregated",
            price_low: aggregated?.price?.low ?? undefined,
            price_high: aggregated?.price?.high ?? undefined,
            condition_prices: conditionPricesForMarket(aggMarket, null),
            scan_debug: {
              ...(result.scan_debug || {}),
              price_debug: { aggregator: aggregated },
              enrichment: {
                trustedDatabaseIdentity: false,
                setReliable, numberReliable,
                reason: `Primary lookup empty — aggregator returned $${aggMarket} via ${aggregated?.primary_source}`,
                params: paramsRecord,
              },
            },
          };
        }
        return {
          ...result,
          scan_debug: {
            ...(result.scan_debug || {}),
            price_debug: j?.price?.debug ?? { note: "No price match", response: j, aggregator: aggregated },
            enrichment: {
              trustedDatabaseIdentity: false,
              setReliable,
              numberReliable,
              reason: "refresh-prices and aggregator both returned no market price",
              params: paramsRecord,
            },
          },
        };
      }
      const market = Number(j.price.market);
      const c = j.price.canonical;
      const trustedDatabaseIdentity =
        c && Number(c.match_score || 0) >= 90 && setReliable && numberReliable;
      const next: ScanResult = {
        ...result,
        estimated_value: trustedDatabaseIdentity ? market : 0,
        condition_prices: trustedDatabaseIdentity
          ? conditionPricesForMarket(market, j.price.raw)
          : undefined,
        price_source: trustedDatabaseIdentity ? j.price.source : undefined,
        price_source_url: trustedDatabaseIdentity ? j.price.source_url : undefined,
        price_low: trustedDatabaseIdentity ? j.price.low : undefined,
        price_high: trustedDatabaseIdentity ? j.price.high : undefined,
        scan_debug: {
          ...(result.scan_debug || {}),
          price_debug: j.price.debug ?? null,
          enrichment: {
            trustedDatabaseIdentity: !!trustedDatabaseIdentity,
            setReliable,
            numberReliable,
            reason: trustedDatabaseIdentity
              ? `Database match accepted (match_score=${c.match_score}).`
              : `Identity not trusted (match_score=${c?.match_score ?? "n/a"}, setReliable=${setReliable}, numberReliable=${numberReliable}). Manual confirmation required.`,
            params: paramsRecord,
          },
        },
      };
      const matches =
        Array.isArray(j.price.matches) && j.price.matches.length
          ? trustedDatabaseIdentity
            ? j.price.matches.slice(1)
            : j.price.matches
          : j.price.alternatives;
      if (Array.isArray(matches) && matches.length) next.alternatives = matches;
      if (trustedDatabaseIdentity) {
        if (c.name) next.name = c.name;
        if (c.set) next.set = c.set;
        if (c.number) next.tcg_number = c.number;
        if (c.rarity) next.rarity = c.rarity;
        if (c.year) next.year = c.year;
        if (c.image_large || c.image_small) next.reference_image = c.image_large || c.image_small;
        next.overall_confidence = Math.max(next.overall_confidence ?? 0, 0.95);
        next.match_label = "Database Match";
        next.confidence = { name: 0.98, set: 0.98, year: 0.98, tcg_number: 0.98, variant: 0.9 };
      } else {
        next.reference_image = undefined;
        next.overall_confidence = Math.min(next.overall_confidence ?? 0.6, 0.69);
        next.match_label = "Needs confirmation — tap the correct picture before saving";
      }
      return next;
    } catch (e: any) {
      return {
        ...result,
        scan_debug: {
          ...(result.scan_debug || {}),
          enrichment: {
            trustedDatabaseIdentity: false,
            setReliable: false,
            numberReliable: false,
            reason: `enrichWithMarketPrice threw: ${e?.message || e}`,
            params: {},
          },
        },
      };
    }
  }

  async function capture(externalDataUrl?: string) {
    if (capturingRef.current) return;
    if (!externalDataUrl && !videoRef.current) return;
    capturingRef.current = true;
    setScanning(true);
    try {
      let dataUrl: string;
      if (externalDataUrl) {
        dataUrl = externalDataUrl;
      } else {
        const v = videoRef.current!;
        const srcW = v.videoWidth || 1280;
        const srcH = v.videoHeight || 720;
        // Smaller payload = much faster AI round-trip. Multi-card keeps a bit more res for legibility.
        const MAX = multi ? 1600 : 1024;
        const scale = Math.min(1, MAX / Math.max(srcW, srcH));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(srcW * scale);
        canvas.height = Math.round(srcH * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas error");
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      }

      // Show the captured photo immediately while AI runs (Photo Scan Mode)
      setCaptured(dataUrl);
      stopScannerCamera();

      const { data, error } = await supabase.functions.invoke("scan-card", {
        body: { image: dataUrl, language: language === "auto" ? undefined : language, multi },
      });
      if (error) {
        // FunctionsHttpError surfaces the JSON body in error.context
        let msg = error.message || "Scan failed";
        try {
          const ctx: any = (error as any).context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) msg = parsed.error;
          }
        } catch {}
        toast.error(msg);
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error);
        return;
      }

      const ocrRaw = (data as any)?.ocr_raw ?? null;
      if (multi) {
        const cards: ScanResult[] = await Promise.all(
          ((data as any)?.cards || []).map((c: any) =>
            enrichWithMarketPrice({
              ...c,
              image: dataUrl,
              language: c.language || language,
              scan_debug: { ocr_raw: c?.ocr_raw ?? ocrRaw },
            }),
          ),
        );
        if (cards.length === 0) {
          toast.error("No cards detected — try better lighting or fewer cards");
        } else {
          setBatch(cards);
          setSelected(
            new Set(
              cards.map((c, i) => (requiresManualConfirmation(c) ? -1 : i)).filter((i) => i >= 0),
            ),
          ); // only pre-select safe matches
          // stop camera while reviewing
          stopScannerCamera();
        }
      } else {
        const result: ScanResult = await enrichWithMarketPrice({
          ...(data as any),
          image: dataUrl,
          language,
          scan_debug: { ocr_raw: ocrRaw },
        });
        setSuggestionIndex(-1);
        setPending(result);
        // Best-effort scan history log (RLS will reject if not signed in — ignore)
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u?.user?.id) {
            await supabase.from("scan_history").insert({
              user_id: u.user.id,
              top_name: result.name,
              top_set: result.set || null,
              top_number: result.tcg_number || null,
              top_rarity: result.rarity || null,
              top_variant: result.variant || null,
              top_value: result.estimated_value || null,
              overall_confidence: result.overall_confidence || null,
              alternatives: result.alternatives || [],
            });
          }
        } catch {
          /* non-fatal */
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Scan failed");
    } finally {
      setScanning(false);
      capturingRef.current = false;
    }
  }

  // Auto-capture has been intentionally removed — users tap the shutter or upload a photo manually.

  function requiresManualConfirmation(result: ScanResult | null) {
    if (!result) return false;
    if (result.match_label === "Manually selected" || result.match_label === "Match confirmed")
      return false;
    const oc = result.overall_confidence ?? 0;
    const nameOk = (result.confidence?.name ?? 0) >= 0.85;
    const setOk = (result.confidence?.set ?? 0) >= 0.85;
    const numberOk = (result.confidence?.tcg_number ?? 0) >= 0.9;
    return (
      oc < 0.85 ||
      !nameOk ||
      !setOk ||
      !numberOk ||
      !result.price_source ||
      Number(result.estimated_value || 0) <= 0
    );
  }

  function confirmResult() {
    if (!pending) return;
    if (requiresManualConfirmation(pending)) {
      toast.error(
        "Pick the exact card picture before saving — this scan is not safe to auto-save.",
      );
      setFinderOpen(true);
      return;
    }
    onResult(pending);
  }

  function patch<K extends keyof ScanResult>(k: K, v: ScanResult[K]) {
    setPending((p) => (p ? { ...p, [k]: v } : p));
  }

  function rescan() {
    setPending(null);
    setBatch(null);
    setSelected(new Set());
    setEditing(false);
    setCaptured(null);
    setSuggestionIndex(-1);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking same file works
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("Image too large (max 12MB)");
      return;
    }
    try {
      // Read + downscale large uploads so the AI gateway stays fast
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const resized = await downscaleDataUrl(dataUrl, multi ? 1600 : 1024);
      await capture(resized);
    } catch (err: any) {
      toast.error(err?.message || "Could not load image");
    }
  }

  function lowConf(v?: number) {
    return (v ?? 1) < 0.7;
  }

  function toggleSel(i: number) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }
  function toggleSelectAll() {
    if (!batch) return;
    setSelected((s) => (s.size === batch.length ? new Set() : new Set(batch.map((_, i) => i))));
  }
  function addSelected() {
    if (!batch) return;
    const chosen = batch.filter((_, i) => selected.has(i));
    const picks = chosen.filter((p) => !requiresManualConfirmation(p));
    if (picks.length === 0) return toast.error("Select at least one card");
    if (picks.length !== chosen.length) {
      toast.error("Skipped cards that need exact-picture confirmation first.");
    }
    if (onResults) onResults(picks);
    else picks.forEach((p) => onResult(p)); // fallback for callers w/o batch handler
  }

  function handleAction(action: ScanAction) {
    if (!pending) return;
    if (requiresManualConfirmation(pending)) {
      toast.error("Pick the exact card picture before using this scan.");
      setFinderOpen(true);
      return;
    }
    onAction?.(action, pending);
  }

  function applySuggestedCard(
    a: ScanAlternative,
    nextIndex: number,
    label = "Similar card selected",
  ) {
    setSuggestionIndex(nextIndex);
    setPending((p) => {
      if (!p) return p;
      const market = Number(a.estimated_value || 0);
      return {
        ...p,
        name: a.name || p.name,
        set: a.set || p.set,
        year: a.year || p.year,
        tcg_number: a.tcg_number || p.tcg_number,
        variant: a.variant || p.variant,
        rarity: a.rarity || p.rarity,
        estimated_value: market || p.estimated_value,
        condition_prices: market
          ? {
              NM: market,
              LP: Math.round(market * 0.85 * 100) / 100,
              MP: Math.round(market * 0.6 * 100) / 100,
              Damaged: Math.max(0.5, Math.round(market * 0.25 * 100) / 100),
            }
          : p.condition_prices,
        image: a.image_url || p.image,
        reference_image: a.image_url || p.reference_image,
        overall_confidence: 0.95,
        match_label: label,
        confidence: { name: 0.98, set: 0.98, year: 0.95, tcg_number: 0.98, variant: 0.9 },
        ...(market ? { price_source: "TCGPlayer (Pokémon TCG API)" } : {}),
      };
    });
  }

  function cycleSimilarCard() {
    if (!pending?.alternatives?.length) return;
    const nextIndex =
      pending.alternatives.length === 1 ? 0 : (suggestionIndex + 1) % pending.alternatives.length;
    applySuggestedCard(pending.alternatives[nextIndex], nextIndex, "Similar database match");
  }

  const displayImage = pending?.reference_image || pending?.image || "";
  const similarCount = pending?.alternatives?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-3">
        <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white">
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-white">
          {pending
            ? "Confirm card"
            : batch
              ? `Detected ${batch.length} cards`
              : multi
                ? "Scan multiple cards"
                : "Scan Card"}
        </p>
        {!pending && !batch ? (
          <button
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            className="rounded-full bg-white/10 p-2 text-white"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={rescan}
            className="rounded-full bg-white/10 p-2 text-white"
            title="Rescan"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
      </div>

      {!pending && !batch && !captured && (
        <>
          <div className="px-3 pb-2 space-y-2">
            {allowMulti && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setMulti(false)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${!multi ? "bg-white text-black" : "bg-white/10 text-white"}`}
                >
                  Single card
                </button>
                <button
                  onClick={() => setMulti(true)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 ${multi ? "bg-emerald-500 text-white" : "bg-white/10 text-white"}`}
                >
                  <Layers className="h-3.5 w-3.5" /> Multi-card
                </button>
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                Card language
              </p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.v}
                    onClick={() => setLanguage(lang.v)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${language === lang.v ? "bg-white text-black" : "bg-white/10 text-white"}`}
                  >
                    {lang.l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/80">
                {error}
              </div>
            ) : (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            )}
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/60" />
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/70">
              {multi
                ? "Lay cards flat, no overlap · keep all set symbols visible"
                : "Frame the whole card · keep set symbol + card number visible"}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-50"
                title="Upload photo"
                aria-label="Upload photo from gallery"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => capture()}
                disabled={scanning || !!error}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black disabled:opacity-50"
                aria-label="Capture photo"
              >
                {scanning ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <Camera className="h-7 w-7" />
                )}
              </button>
              <div className="h-12 w-12" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <p className="mt-1 text-center text-[11px] text-white/50">
              or tap <ImageIcon className="inline h-3 w-3" /> to upload a photo / screenshot
            </p>
            <p className="mt-2 text-center text-xs text-white/60">
              {scanning
                ? multi
                  ? "Reading every card…"
                  : "Identifying…"
                : "Tap the shutter when your card is in frame"}
            </p>
          </div>
        </>
      )}

      {/* Photo Scan Mode — captured photo preview while AI runs */}
      {captured && !pending && !batch && (
        <div className="flex flex-1 flex-col">
          <div className="relative flex-1 overflow-hidden bg-black">
            <img src={captured} alt="Captured card" className="h-full w-full object-contain" />
            {scanning && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-white">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  <span className="text-sm font-bold">
                    {multi ? "Reading every card…" : "AI analyzing photo…"}
                  </span>
                </div>
                <p className="text-[11px] text-white/70">
                  Detecting set symbol, card number, and variant
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              onClick={rescan}
              disabled={scanning}
              className="rounded-xl bg-white/10 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className="mr-1 inline h-4 w-4" /> Retake
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              className="rounded-xl bg-white/10 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Upload className="mr-1 inline h-4 w-4" /> Pick another
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}

      {/* Multi-card review */}
      {batch && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-2">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white"
            >
              {selected.size === batch.length ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              {selected.size === batch.length ? "Deselect all" : "Select all"}
            </button>
            <p className="text-[11px] text-white/60">
              {selected.size} / {batch.length} selected
            </p>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto px-4 pb-2 sm:grid-cols-3">
            {batch.map((c, i) => {
              const on = selected.has(i);
              const warn =
                lowConf(c.confidence?.name) ||
                lowConf(c.confidence?.set) ||
                lowConf(c.confidence?.tcg_number);
              return (
                <button
                  key={i}
                  onClick={() => toggleSel(i)}
                  className={`relative overflow-hidden rounded-xl border-2 text-left transition ${on ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/5"}`}
                >
                  <div className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/60 p-1 text-white">
                    {on ? (
                      <CheckSquare className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </div>
                  <div className="aspect-[3/4] w-full bg-black">
                    <img src={c.image} alt="" className="h-full w-full object-cover opacity-90" />
                  </div>
                  <div className="space-y-0.5 p-2 text-white">
                    <p className="truncate text-[12px] font-bold">{c.name}</p>
                    <p className="truncate text-[10px] text-white/60">
                      {c.set || "—"} {c.tcg_number ? `· #${c.tcg_number}` : ""}
                    </p>
                    <p className="text-[10px] text-emerald-300">
                      ${Number(c.estimated_value || 0).toFixed(2)}
                    </p>
                    {warn && (
                      <p className="text-[9px] text-yellow-300">⚠ Low confidence — verify</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            <button
              onClick={rescan}
              className="rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
            >
              Rescan
            </button>
            <button
              onClick={addSelected}
              disabled={selected.size === 0}
              className="rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              Add {selected.size > 0 ? `${selected.size} ` : ""}selected
            </button>
          </div>
        </div>
      )}

      {pending && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6">
          {/* Confidence badge */}
          {(() => {
            const oc = pending.overall_confidence ?? 0.6;
            const pct = Math.round(oc * 100);
            const tone =
              oc >= 0.9
                ? "bg-emerald-500/20 text-emerald-300 ring-emerald-400/40"
                : oc >= 0.7
                  ? "bg-yellow-500/15 text-yellow-200 ring-yellow-400/40"
                  : "bg-red-500/15 text-red-300 ring-red-400/40";
            const label =
              pending.match_label ||
              (oc >= 0.9
                ? `${pct}% Match`
                : oc >= 0.7
                  ? `Likely Match (${pct}%)`
                  : "Possible Match");
            return (
              <div
                className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 ${tone}`}
              >
                <div className="flex items-center gap-2 text-[12px] font-bold">
                  <Sparkles className="h-3.5 w-3.5" /> {label}
                </div>
                <div className="text-[10px] uppercase tracking-wide opacity-80">AI confidence</div>
              </div>
            );
          })()}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={cycleSimilarCard}
              disabled={!similarCount}
              className="group relative h-40 w-28 shrink-0 overflow-hidden rounded-lg bg-white/5 text-left ring-1 ring-white/20 disabled:cursor-default"
              aria-label="Show next similar card"
            >
              <img src={displayImage} alt={pending.name} className="h-full w-full object-cover" />
              {similarCount > 0 && (
                <div className="absolute inset-x-1 bottom-1 rounded-md bg-black/75 px-1.5 py-1 text-center text-[9px] font-bold text-white">
                  Tap for similar{" "}
                  {suggestionIndex >= 0
                    ? `${suggestionIndex + 1}/${similarCount}`
                    : `1/${similarCount}`}
                </div>
              )}
            </button>
            <div className="min-w-0 flex-1 space-y-1.5 text-white">
              <Field
                label="Name"
                value={pending.name}
                editing={editing}
                onChange={(v) => patch("name", v)}
                warn={lowConf(pending.confidence?.name)}
              />
              <Field
                label="Set"
                value={pending.set || ""}
                editing={editing}
                onChange={(v) => patch("set", v)}
                warn={lowConf(pending.confidence?.set)}
              />
              <div className="grid grid-cols-3 gap-2">
                <Field
                  label="Year"
                  value={pending.year || ""}
                  editing={editing}
                  onChange={(v) => patch("year", v)}
                  warn={lowConf(pending.confidence?.year)}
                />
                <Field
                  label="Number"
                  value={pending.tcg_number || ""}
                  editing={editing}
                  onChange={(v) => patch("tcg_number", v)}
                  warn={lowConf(pending.confidence?.tcg_number)}
                />
                <Field
                  label="Lang"
                  value={pending.language || "EN"}
                  editing={editing}
                  onChange={(v) => patch("language", v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Variant"
                  value={pending.variant || "Standard"}
                  editing={editing}
                  onChange={(v) => patch("variant", v)}
                  warn={lowConf(pending.confidence?.variant)}
                />
                <Field
                  label="Rarity"
                  value={pending.rarity || ""}
                  editing={editing}
                  onChange={(v) => patch("rarity", v)}
                />
              </div>
              <p className="text-[11px] text-white/70">
                {(pending as any).price_source ? "Market" : "Est."} value:{" "}
                <b className="text-emerald-300">
                  ${Number(pending.estimated_value || 0).toFixed(2)}
                </b>
                {(pending as any).price_low != null && (pending as any).price_high != null && (
                  <span className="text-white/50">
                    {" "}
                    · L ${Number((pending as any).price_low).toFixed(2)} / H $
                    {Number((pending as any).price_high).toFixed(2)}
                  </span>
                )}
                {" · "}
                {pending.trend}
              </p>
              {(pending as any).price_source && (
                <p className="text-[9px] uppercase tracking-wider text-emerald-400/80">
                  ✓ Verified price · {(pending as any).price_source}
                </p>
              )}
            </div>
          </div>

          {requiresManualConfirmation(pending) && (
            <div className="rounded-xl bg-destructive/15 p-3 text-[12px] font-semibold text-destructive ring-1 ring-destructive/40">
              Not safe to auto-save yet. Choose the exact card image below or use “Find it manually”
              so the vault doesn’t save the wrong picture or price.
            </div>
          )}

          {/* Similar database matches */}
          {(pending.alternatives?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/70">
                Similar cards — tap one to use set + price
              </p>
              <div className="grid grid-cols-3 gap-2">
                {pending.alternatives!.slice(0, 6).map((a, i) => (
                  <button
                    key={i}
                    onClick={() => applySuggestedCard(a, i, "Match confirmed")}
                    className="overflow-hidden rounded-lg bg-black/40 text-left ring-1 ring-white/10 transition hover:ring-emerald-400/60"
                  >
                    <div className="aspect-[3/4] w-full bg-black">
                      {a.image_url ? (
                        <img src={a.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-white/40">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 p-1.5 text-white">
                      <p className="truncate text-[11px] font-bold">{a.name}</p>
                      <p className="truncate text-[9px] text-white/60">
                        {a.set || "—"}
                        {a.tcg_number ? ` · #${a.tcg_number}` : ""}
                      </p>
                      {a.estimated_value ? (
                        <p className="text-[10px] text-emerald-300">
                          ${Number(a.estimated_value).toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {pending.scan_debug && <ScanDebugPanel debug={pending.scan_debug} result={pending} />}

          {(lowConf(pending.confidence?.set) ||
            lowConf(pending.confidence?.year) ||
            lowConf(pending.confidence?.tcg_number)) && (
            <div className="rounded-lg bg-yellow-500/15 px-3 py-2 text-[11px] text-yellow-200">
              ⚠ Low confidence on highlighted fields — please verify or edit before saving.
            </div>
          )}

          {/* Quick actions */}
          {liveMode ? (
            <button
              onClick={confirmResult}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent py-4 text-base font-extrabold text-white shadow-lg"
            >
              <Gavel className="h-5 w-5" /> Show on Live & Start Auction
            </button>
          ) : onAction ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAction("inventory")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-white"
              >
                <Package className="h-4 w-4" /> Add to Inventory
              </button>
              <button
                onClick={() => handleAction("list")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-sm font-extrabold text-black"
              >
                <Tag className="h-4 w-4" /> List for Sale
              </button>
              <button
                onClick={() => handleAction("auction")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
              >
                <Gavel className="h-4 w-4" /> Start Auction
              </button>
              <button
                onClick={() => handleAction("offer")}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/20 py-3 text-sm font-bold text-primary"
              >
                <Tag className="h-4 w-4" /> Make Offer
              </button>
              <button
                onClick={() => handleAction("draft")}
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
              >
                <Save className="h-4 w-4" /> Save Draft
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEditing((e) => !e)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm font-bold text-white"
              >
                <Pencil className="h-4 w-4" /> {editing ? "Done editing" : "Edit fields"}
              </button>
              <button
                onClick={confirmResult}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-white"
              >
                <Check className="h-4 w-4" /> Confirm & save
              </button>
            </div>
          )}

          {/* ALWAYS-VISIBLE wrong-card escape hatch — opens the manual finder */}
          <button
            onClick={() => setFinderOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/15 py-3 text-sm font-extrabold text-red-200 ring-1 ring-red-400/40"
          >
            <AlertTriangle className="h-4 w-4" /> Wrong card? Find it manually
          </button>

          <div className="flex items-center justify-center gap-3 text-[11px]">
            <button
              onClick={() => setEditing((e) => !e)}
              className="flex items-center gap-1 text-white/70 underline"
            >
              <Pencil className="h-3 w-3" /> {editing ? "Done editing" : "Edit fields"}
            </button>
            <button onClick={rescan} className="text-white/60 underline">
              Rescan
            </button>
          </div>
        </div>
      )}

      {finderOpen && (
        <ManualCardFinder
          initialQuery={pending?.name || ""}
          onClose={() => setFinderOpen(false)}
          onPick={async (c: FinderCard) => {
            // Replace the pending scan with the manually-picked card
            setPending((p) => {
              const base: ScanResult = p || {
                name: c.name,
                category: "Trading Card",
                trend: "Stable Demand 📊",
                image: c.image_large || c.image_small || "",
              };
              return {
                ...base,
                name: c.name,
                set: c.set || base.set,
                year: c.year || base.year,
                tcg_number: c.number || base.tcg_number,
                rarity: c.rarity || base.rarity,
                variant: c.is_holo
                  ? "Holo"
                  : c.is_reverse_holo
                    ? "Reverse Holo"
                    : base.variant || "Standard",
                estimated_value: c.tcgplayer_price ?? base.estimated_value,
                image: c.image_large || c.image_small || base.image,
                reference_image: c.image_large || c.image_small || base.reference_image,
                price_source: c.tcgplayer_price ? "Manual database selection" : base.price_source,
                overall_confidence: 1,
                match_label: "Manually selected",
                alternatives: [],
                confidence: { name: 1, set: 1, year: 1, tcg_number: 1, variant: 1 },
              };
            });
            setFinderOpen(false);
            // Mark this user's most recent scan as corrected (best-effort)
            try {
              const { data: u } = await supabase.auth.getUser();
              if (u?.user?.id) {
                const { data: last } = await supabase
                  .from("scan_history")
                  .select("id")
                  .eq("user_id", u.user.id)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (last?.id) {
                  await supabase
                    .from("scan_history")
                    .update({ was_corrected: true, picked_card_id: c.id })
                    .eq("id", last.id);
                }
              }
            } catch {
              /* non-fatal */
            }
            toast.success(`Switched to ${c.name}`);
            onFindCorrect?.({
              name: c.name,
              category: "Trading Card",
              trend: "Stable Demand 📊",
              image: c.image_large || c.image_small || "",
              set: c.set,
              year: c.year,
              tcg_number: c.number,
              rarity: c.rarity,
              variant: c.is_holo ? "Holo" : c.is_reverse_holo ? "Reverse Holo" : "Standard",
              estimated_value: c.tcgplayer_price,
            });
          }}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  warn,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-md ${warn ? "ring-1 ring-yellow-400/60" : ""}`}>
      <p className="text-[9px] font-bold uppercase tracking-wide text-white/50">{label}</p>
      {editing ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded bg-white/10 px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-400"
        />
      ) : (
        <p className="text-sm font-semibold text-white">
          {value || <span className="text-white/40">—</span>}
        </p>
      )}
    </div>
  );
}

async function downscaleDataUrl(src: string, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas error"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

function ScanDebugPanel({ debug, result }: { debug: NonNullable<ScanResult["scan_debug"]>; result: ScanResult }) {
  const [open, setOpen] = useState(false);
  const ocr = debug.ocr_raw;
  const pd = debug.price_debug;
  const enr = debug.enrichment;
  const copy = () => {
    const payload = {
      scanned: {
        name: result.name,
        set: result.set,
        number: result.tcg_number,
        rarity: result.rarity,
        variant: result.variant,
        confidence: result.confidence,
        overall_confidence: result.overall_confidence,
        estimated_value: result.estimated_value,
        price_source: result.price_source,
        match_label: result.match_label,
      },
      ocr_raw: ocr,
      enrichment: enr,
      price_debug: pd,
    };
    try {
      navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
      toast.success("Debug report copied");
    } catch {
      toast.error("Could not copy");
    }
  };
  return (
    <div className="rounded-xl bg-black/40 p-3 ring-1 ring-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[11px] font-bold uppercase tracking-wide text-white/70"
      >
        <span>🔍 Debug report {enr?.trustedDatabaseIdentity ? "(trusted match)" : "(needs review)"}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[11px] text-white/80">
          {enr && (
            <div>
              <p className="font-bold text-white">Enrichment</p>
              <p>{enr.reason}</p>
              <p className="text-white/60">
                setReliable={String(enr.setReliable)} · numberReliable={String(enr.numberReliable)}
              </p>
              <p className="text-white/60">params: {JSON.stringify(enr.params)}</p>
            </div>
          )}
          {pd && (
            <div>
              <p className="font-bold text-white">Price lookup ({pd.source || "n/a"})</p>
              <p className="text-white/60">Input: {JSON.stringify(pd.query_input)}</p>
              <p className="text-white/60">Queries tried: {(pd.queries_tried || []).join(" | ")}</p>
              <p className="text-white/60">Candidates returned: {pd.candidate_count ?? 0}</p>
              {pd.chosen && (
                <p className="text-emerald-300">
                  Chosen: {pd.chosen.name} · {pd.chosen.set} · #{pd.chosen.number} ·{" "}
                  {pd.chosen.variant} · ${pd.chosen.price} (score {pd.chosen.score})
                </p>
              )}
              {Array.isArray(pd.top_candidates) && pd.top_candidates.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-white/70">Top candidates ({pd.top_candidates.length})</summary>
                  <ul className="ml-3 mt-1 list-disc space-y-0.5 text-white/70">
                    {pd.top_candidates.map((c: any, i: number) => (
                      <li key={i}>
                        [{c.score}] {c.name} · {c.set} · #{c.number} · {c.variant} · ${c.price}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {pd.price_logic && <p className="text-white/60">Logic: {pd.price_logic}</p>}
            </div>
          )}
          {ocr && (
            <details>
              <summary className="cursor-pointer font-bold text-white">Raw OCR / AI output</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/60 p-2 text-[10px] text-white/70">
{JSON.stringify(ocr, null, 2)}
              </pre>
            </details>
          )}
          <button
            onClick={copy}
            className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-bold text-white hover:bg-white/20"
          >
            Copy debug report
          </button>
        </div>
      )}
    </div>
  );
}
