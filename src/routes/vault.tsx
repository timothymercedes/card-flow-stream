import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { propagateIdentityPrice, resolveMasterIdentity } from "@/lib/cardIdentity.functions";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Trash2, Plus, Camera, Tag, Pencil, X, DollarSign, Lock, Users, UserCheck, Globe, Search, Mic, MicOff, ArrowLeft, LayoutGrid, Grid3x3, List, Rows, AlertTriangle, Layers, History, ShieldCheck, Flag, Image as ImageIcon, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { categoryToGameId } from "@/lib/scannerGame";
const CardScanner = lazy(() => import("@/components/CardScanner").then(m => ({ default: m.CardScanner })));
import { WatchTutorial } from "@/components/WatchTutorial";
import { CardPriceChart } from "@/components/CardPriceChart";
import { VaultGrowthChart } from "@/components/VaultGrowthChart";
import { GradedCardPanel } from "@/components/GradedCardPanel";
import { PurchaseInfoPanel } from "@/components/PurchaseInfoPanel";
import { CardMatchPicker, type MatchOption, type ManualCardEntry } from "@/components/CardMatchPicker";
import { ListingImageUpload } from "@/components/ListingImageUpload";
import { validateListingImage } from "@/lib/listingDisplay";

export const Route = createFileRoute("/vault")({ component: Vault });

type Condition = "NM" | "LP" | "MP" | "Damaged";
type Visibility = "private" | "followers" | "friends" | "public";
type ConditionPrices = { NM?: number; LP?: number; MP?: number; Damaged?: number };
type Card = {
  id: string; user_id: string; name: string; category: string | null;
  image_url: string | null; back_image_url?: string | null; description: string | null;
  estimated_value: number | null; price: number | null;
  tcg_number?: string | null; tcg_set?: string | null; tcg_year?: string | null;
  condition?: Condition | null;
  condition_prices?: ConditionPrices | null;
  visibility?: Visibility | null; language?: string | null;
  market_price?: number | null;
  is_graded?: boolean | null; grader?: string | null; grade?: string | null;
  grading_cert?: string | null; graded_price?: number | null;
  price_source?: string | null; price_updated_at?: string | null;
  price_confidence?: string | null; price_is_ai?: boolean | null;
  price_locked?: boolean | null; custom_price?: number | null;
  grade_values?: Record<string, number> | null; is_sealed?: boolean | null;
  price_tier?: string | null; price_range_low?: number | null; price_range_high?: number | null;
  rarity?: string | null; variant?: string | null; image_source?: string | null;
  original_image_url?: string | null; ai_image_url?: string | null; image_gallery?: unknown[] | null;
  confidence_score?: number | null; needs_review?: boolean | null; review_reason?: string | null;
  identification_details?: Record<string, unknown> | null; last_rescan_at?: string | null;
  created_at?: string | null; match_history?: { from?: string; to?: string; by?: string; at?: string }[] | null;
  incorrect_price_reported?: boolean | null; incorrect_price_reported_at?: string | null;
  wrong_match_reported_at?: string | null;
  purchase_price?: number | null; purchase_date?: string | null; purchased_from?: string | null;
  confirmed_by?: string | null;
  card_identity_id?: string | null; master_identity_id?: string | null; enrichment_status?: string | null;
  pricing_details?: Record<string, unknown> | null; price_source_url?: string | null;
  accept_trades?: boolean | null; trade_plus_cash?: boolean | null;
  accept_offers?: boolean | null; collection_only?: boolean | null;
};

function Vault() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const propagatePrice = useServerFn(propagateIdentityPrice);
  const resolveMaster = useServerFn(resolveMasterIdentity);

  // Ensure a vault card is registered into the master identity DB and linked.
  // Best-effort: never blocks the main write. Used by manual add / correction /
  // language + variant changes so every card self-registers without the engine.
  async function ensureMasterIdentity(cardId: string, info: {
    category?: string | null; name?: string | null; tcg_set?: string | null;
    tcg_number?: string | null; tcg_year?: string | null; variant?: string | null;
    language?: string | null; rarity?: string | null; image_url?: string | null;
    card_identity_id?: string | null; confidence_score?: number | null;
  }) {
    try {
      if (!info.name) return null;
      const yr = info.tcg_year ? parseInt(String(info.tcg_year), 10) : null;
      const res: any = await resolveMaster({
        data: {
          vaultCardId: cardId,
          category: info.category || "other",
          name: info.name,
          set_name: info.tcg_set || null,
          number: info.tcg_number || null,
          year: Number.isFinite(yr as number) ? (yr as number) : null,
          variant: info.variant || null,
          language: info.language || "en",
          rarity: info.rarity || null,
          image_url: info.image_url || null,
          image_source: "user",
          confidence_score: info.confidence_score ?? null,
          provider_keys: info.card_identity_id ? [info.card_identity_id] : [],
        },
      });
      if (res?.identityId) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, master_identity_id: res.identityId } : c)));
      }
      return res?.identityId ?? null;
    } catch (e) {
      console.error("ensureMasterIdentity failed", e);
      return null;
    }
  }
  const [cards, setCards] = useState<Card[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [selling, setSelling] = useState<Card | null>(null);
  const [actionFor, setActionFor] = useState<Card | null>(null);
  const [matchingCard, setMatchingCard] = useState<Card | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [bulkMatch, setBulkMatch] = useState(false);
  const [imgKey, setImgKey] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [vaultVisibility, setVaultVisibility] = useState<Visibility>("private");
  const [savingVis, setSavingVis] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [listening, setListening] = useState(false);
  const [viewMode, setViewMode] = useState<"small" | "grid" | "large" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("pbl_vault_view") as any) || "grid";
  });
  const [viewMenu, setViewMenu] = useState(false);
  useEffect(() => { try { localStorage.setItem("pbl_vault_view", viewMode); } catch {} }, [viewMode]);
  useEffect(() => { setImgKey(null); setAdvanced(false); }, [actionFor?.id]);
  const recognitionRef = (typeof window !== "undefined" ? (window as any) : {}) as any;

  const LANGUAGES = [
    { v: "en", l: "English" }, { v: "jp", l: "Japanese" }, { v: "kr", l: "Korean" },
    { v: "zh", l: "Chinese" }, { v: "de", l: "German" }, { v: "fr", l: "French" },
    { v: "es", l: "Spanish" }, { v: "it", l: "Italian" }, { v: "pt", l: "Portuguese" }, { v: "ru", l: "Russian" },
  ] as const;
  const [language, setLanguage] = useState<string>("en");

  // add form
  const [name, setName] = useState("");
  const [tcgNumber, setTcgNumber] = useState("");
  const [tcgSet, setTcgSet] = useState("");
  const [tcgYear, setTcgYear] = useState("");
  const [category, setCategory] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [backImageUrl, setBackImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [estValue, setEstValue] = useState(""); // auto-filled, read-only
  const [condPrices, setCondPrices] = useState<ConditionPrices | null>(null);
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<Condition>("NM");
  const [sellAfterSave, setSellAfterSave] = useState(false);
  // (vault-wide visibility lives on vault_settings, not per card)
  const [identifying, setIdentifying] = useState(false);
  type TcgPrices = Record<string, { market?: number; mid?: number; low?: number; high?: number } | undefined>;
  type Alt = { id: string; name: string; set?: string; number?: string; image?: string; price?: number; year?: string; category?: string; tcgPrices?: TcgPrices };
  const [alternatives, setAlternatives] = useState<Alt[]>([]);
  const [altIndex, setAltIndex] = useState(0);
  type Edition = "Unlimited" | "1st Edition";
  type Finish = "Holo" | "Non-Holo" | "Reverse Holo";
  const [edition, setEdition] = useState<Edition>("Unlimited");
  const [finish, setFinish] = useState<Finish>("Holo");

  function cleanSearchText(v?: string | null) {
    return String(v || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/^[A-Z0-9-]{2,}:\s*/i, "")
      .replace(/pokemon/gi, "Pokémon")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cardNumberBase(v?: string | null) {
    return cleanSearchText(v).split("/")[0].trim();
  }

  function needsOfficialCardImage(url?: string | null) {
    if (!url) return true;
    const u = url.toLowerCase();
    return u.includes("images.unsplash.com") || u.includes("generate-card-image");
  }

  function looksLikeUserUpload(url?: string | null) {
    if (!url) return false;
    const u = url.toLowerCase();
    return u.startsWith("data:") || u.includes("vault-images") || u.includes("storage") || u.includes("blob:");
  }

  function displayImage(card: Card) {
    return card.ai_image_url || card.image_url || card.original_image_url || "";
  }

  function isCompleteIdentity(card: Partial<Card>) {
    // A value may only be assigned once the exact card version is identified:
    // name, set, card number, year, rarity AND variant must all be present.
    return !!(card.name && card.tcg_set && card.tcg_number && card.tcg_year && card.rarity && card.variant);
  }

  function isSafePriced(card: Card) {
    // Manual override (locked) is always trusted.
    if (card.price_locked) return Number(card.estimated_value || 0) > 0;
    // Otherwise the card must be verified: not flagged for review, not low
    // confidence, and explicitly priced through a verified tier. The "verified"
    // tier is only set after exact structured identity is confirmed (either by
    // auto-enrichment or a user-confirmed visual match), so we trust it here.
    if (card.needs_review) return false;
    if (card.price_confidence === "low") return false;
    if (card.price_tier && card.price_tier !== "verified") return false;
    if (!card.price_tier) return false;
    return Number(card.estimated_value || 0) > 0;
  }

  // A card the collector has explicitly confirmed (chose a match in the picker
  // or entered it manually) is permanently trusted. Manual confirmation always
  // overrides AI uncertainty — we never put it back into review or auto-reprice
  // it unless the user changes it again.
  function isUserVerified(card: Card) {
    return !!(
      card.price_locked ||
      card.confirmed_by ||
      card.price_source === "user_confirmed" ||
      card.price_source === "manual_entry"
    );
  }

  // Per-card gain vs. what the owner paid (only when a purchase price exists).
  function cardGain(card: Card): number | null {
    if (card.purchase_price == null) return null;
    const paid = Number(card.purchase_price);
    if (Number.isNaN(paid)) return null;
    return Number(card.estimated_value || 0) - paid;
  }



  // Match confidence tier → colour (Green ≥90%, Yellow 70-89%, Red <70%).
  function confidenceTier(score?: number | null) {
    const s = Number(score || 0);
    const pct = Math.round(s * 100);
    if (s >= 0.9) return { label: "High", pct, dot: "bg-emerald-500", text: "text-emerald-500", chip: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30" };
    if (s >= 0.7) return { label: "Medium", pct, dot: "bg-yellow-500", text: "text-yellow-500", chip: "bg-yellow-500/15 text-yellow-500 ring-yellow-500/30" };
    return { label: "Low", pct, dot: "bg-red-500", text: "text-red-500", chip: "bg-red-500/15 text-red-500 ring-red-500/30" };
  }

  // Price verification badge: User Override → Needs Review → Verified → Estimated.
  function priceBadge(card: Card) {
    if (card.price_locked) return { label: "User Override", cls: "bg-sky-500/15 text-sky-400 ring-sky-500/30" };
    if (card.needs_review) return { label: "Needs Review", cls: "bg-amber-500/15 text-amber-500 ring-amber-500/30" };
    if (card.price_tier === "verified") return { label: "Verified Price", cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30" };
    return { label: "Estimated Price", cls: "bg-muted text-muted-foreground ring-border/60" };
  }

  function hasImage(card: Card) {
    return !!card.ai_image_url || !needsOfficialCardImage(card.image_url);
  }

  // Available image variants for the toggle (Original / AI Enhanced / Catalog).
  function imageOptions(card: Card): { key: string; label: string; url: string }[] {
    const gallery = Array.isArray(card.image_gallery) ? (card.image_gallery as { url?: string; type?: string }[]) : [];
    const byType = (t: string) => gallery.find((g) => g?.type === t)?.url || null;
    const original = byType("user_upload") || card.original_image_url || (looksLikeUserUpload(card.image_url) ? card.image_url : null);
    const ai = byType("ai_generated") || (card.image_source === "ai_generated" ? card.ai_image_url : null);
    const catalog = byType("catalog") || (card.image_source === "catalog" ? (card.image_url || card.ai_image_url) : null);
    const out: { key: string; label: string; url: string }[] = [];
    if (catalog) out.push({ key: "catalog", label: "Catalog", url: catalog });
    if (ai) out.push({ key: "ai", label: "AI Enhanced", url: ai });
    if (original) out.push({ key: "original", label: "Original", url: original });
    // Fallback so there is always at least one option.
    if (out.length === 0 && displayImage(card)) out.push({ key: "default", label: "Photo", url: displayImage(card) });
    return out;
  }

  // Flag a card's reported market price as incorrect (feeds the review summary).
  async function reportIncorrectPrice(card: Card) {
    const patch = { incorrect_price_reported: true, incorrect_price_reported_at: new Date().toISOString(), needs_review: true } as any;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
    setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, ...patch } : prev));
    const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", card.id);
    if (error) toast.error("Could not report price");
    else toast.success("Thanks — flagged for review");
  }

  function conditionPricesFromMarket(price?: number): ConditionPrices | null {
    const nm = Number(price) || 0;
    if (!nm) return null;
    return {
      NM: Math.round(nm * 100) / 100,
      LP: Math.round(nm * 0.85 * 100) / 100,
      MP: Math.round(nm * 0.6 * 100) / 100,
      Damaged: Math.max(0.5, Math.round(nm * 0.25 * 100) / 100),
    };
  }

  function detectGame(category?: string, name?: string, set?: string): "pokemon" | "mtg" | "yugioh" | "unknown" {
    const s = `${category || ""} ${name || ""} ${set || ""}`.toLowerCase();
    if (/pok[eé]mon|pkmn/.test(s)) return "pokemon";
    if (/magic|mtg|gathering/.test(s)) return "mtg";
    if (/yu-?gi-?oh|ygo|yugioh/.test(s)) return "yugioh";
    return "unknown";
  }

  // Scryfall — free MTG price API (USD, EUR, foil/non-foil)
  async function fetchMtgMatches(opts: { name?: string; set?: string; number?: string }): Promise<Alt[]> {
    const name = cleanSearchText(opts.name);
    const setCode = cleanSearchText(opts.set);
    const num = cardNumberBase(opts.number);
    if (!name && !num) return [];
    try {
      const parts = [name && `!"${name.replace(/"/g, "")}"`, setCode && `set:"${setCode.replace(/"/g, "")}"`, num && `cn:${num}`].filter(Boolean);
      const q = parts.join(" ");
      const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released&dir=desc`);
      if (!r.ok) {
        // Retry with looser name search
        if (!name) return [];
        const r2 = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`"${name}"`)}&unique=prints&order=released&dir=desc`);
        if (!r2.ok) return [];
        const j2 = await r2.json();
        return (j2?.data || []).slice(0, 12).map(mapScryfall);
      }
      const j = await r.json();
      return (j?.data || []).slice(0, 12).map(mapScryfall);
    } catch { return []; }
  }
  function mapScryfall(c: any): Alt {
    const p = c.prices || {};
    const price = Number(p.usd) || Number(p.usd_foil) || Number(p.usd_etched) || (Number(p.eur) ? Number(p.eur) * 1.08 : undefined);
    return {
      id: `mtg-${c.id}`,
      name: c.name,
      set: c.set_name,
      number: c.collector_number,
      image: c.image_uris?.large || c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.large,
      price: price || undefined,
      year: c.released_at ? String(c.released_at).slice(0, 4) : undefined,
      category: "Magic: The Gathering",
    };
  }

  // YGOPRODeck — free Yu-Gi-Oh! price API (TCGplayer + Cardmarket)
  async function fetchYugiohMatches(opts: { name?: string; set?: string; number?: string }): Promise<Alt[]> {
    const name = cleanSearchText(opts.name);
    if (!name) return [];
    try {
      const r = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}&num=12&offset=0`);
      if (!r.ok) return [];
      const j = await r.json();
      const arr = j?.data || [];
      return arr.slice(0, 12).map((c: any): Alt => {
        const sets = c.card_sets || [];
        const setMatch = opts.set ? sets.find((s: any) => String(s.set_name || "").toLowerCase().includes(opts.set!.toLowerCase())) : sets[0];
        const tcgPriceFromSets = Number(setMatch?.set_price);
        const cp = c.card_prices?.[0] || {};
        const price = tcgPriceFromSets || Number(cp.tcgplayer_price) || Number(cp.ebay_price) || Number(cp.amazon_price) || Number(cp.cardmarket_price);
        return {
          id: `ygo-${c.id}-${setMatch?.set_code || "0"}`,
          name: c.name,
          set: setMatch?.set_name,
          number: setMatch?.set_code,
          image: c.card_images?.[0]?.image_url,
          price: price || undefined,
          year: undefined,
          category: "Yu-Gi-Oh!",
        };
      });
    } catch { return []; }
  }

  // TCGCSV-backed games (One Piece, Lorcana, DBS Fusion, SWU, Flesh and Blood)
  function detectTcgCsvGame(category?: string, name?: string, set?: string): string | null {
    const s = `${category || ""} ${name || ""} ${set || ""}`.toLowerCase();
    if (/one ?piece|op-?tcg/.test(s)) return "One Piece";
    if (/lorcana/.test(s)) return "Lorcana";
    if (/dragon ?ball.*(fusion|super)/.test(s)) return "Dragon Ball Super Fusion";
    if (/star ?wars.*unlimited|swu/.test(s)) return "Star Wars Unlimited";
    if (/flesh ?and ?blood|fab\b/.test(s)) return "Flesh and Blood";
    return null;
  }

  async function fetchTcgCsvMatches(game: string, opts: { name?: string; set?: string; number?: string }): Promise<Alt[]> {
    const cn = cleanSearchText(opts.name).toLowerCase();
    if (!cn) return [];
    try {
      let q = supabase
        .from("tcg_prices")
        .select("tcgplayer_product_id, name, set_name, number, image_url, market_price, low_price, mid_price")
        .eq("game", game)
        .limit(12);
      // Prefer exact-ish match, fall back to ILIKE
      q = q.ilike("clean_name", `%${cn}%`);
      if (opts.set) q = q.ilike("set_name", `%${opts.set}%`);
      const { data } = await q;
      const rows = data || [];
      return rows.map((r: any): Alt => ({
        id: `csv-${game}-${r.tcgplayer_product_id}`,
        name: r.name,
        set: r.set_name || undefined,
        number: r.number || undefined,
        image: r.image_url || undefined,
        price: Number(r.market_price) || Number(r.mid_price) || Number(r.low_price) || undefined,
        category: game,
      }));
    } catch { return []; }
  }

  // Look up the real card image + similar printings, routing by detected game.
  // Falls back silently if the card isn't in any DB.
  // Merge two match lists, de-duplicating by id and (name+number) so the same
  // card from different sources doesn't appear twice. Keeps the first (higher
  // priority) instance but fills missing image/price from later instances.
  function mergeMatches(...lists: Alt[][]): Alt[] {
    const out: Alt[] = [];
    const seen = new Map<string, Alt>();
    const keyOf = (m: Alt) =>
      `${cleanSearchText(m.name).toLowerCase()}|${cardNumberBase(m.number).toLowerCase()}|${cleanSearchText(m.set).toLowerCase()}`;
    for (const list of lists) {
      for (const m of list) {
        if (!m?.id) continue;
        const key = keyOf(m);
        const existing = seen.get(m.id) || seen.get(key);
        if (existing) {
          if (!existing.image && m.image) existing.image = m.image;
          if (!(existing.price && existing.price > 0) && m.price && m.price > 0) existing.price = m.price;
          continue;
        }
        seen.set(m.id, m);
        seen.set(key, m);
        out.push(m);
      }
    }
    return out;
  }

  // Internal system catalog — searches the FULL card database (local
  // pokemon_cards cache + per-game adapters) via the card-catalog edge
  // function. This guarantees any card the scanner has previously identified
  // (including brand-new sets not yet in the public pokemontcg.io API, e.g.
  // "Mega Evolution Promo") shows up in the correction search.
  async function fetchCatalogMatches(opts: { name?: string; set?: string; number?: string; category?: string }): Promise<Alt[]> {
    const name = cleanSearchText(opts.name);
    const set = cleanSearchText(opts.set);
    const number = cardNumberBase(opts.number);
    if (!name && !number) return [];
    const gameId = categoryToGameId(opts.category) || "pokemon";
    try {
      const { data, error } = await supabase.functions.invoke("card-catalog", {
        body: { name: name || undefined, set: set || undefined, number: number || undefined, game: gameId, limit: 20 },
      });
      if (error) return [];
      const candidates: any[] = (data as any)?.candidates || [];
      return candidates.map((c: any) => ({
        id: String(c.id),
        name: c.name,
        set: c.set_name || c.set_code || undefined,
        number: c.number || undefined,
        image: c.image_large || c.image_small || undefined,
        price: undefined,
        year: c.year ? String(c.year) : undefined,
        category: opts.category || gameId,
        tcgPrices: c.raw?.tcgplayer?.prices,
      })) as Alt[];
    } catch {
      return [];
    }
  }

  async function fetchRealCardMatches(opts: { name?: string; set?: string; number?: string; category?: string }) {
    // Always search the internal system catalog first — it covers the full
    // database, including newly-scanned/promo sets the public APIs lack.
    const catalog = await fetchCatalogMatches(opts);

    const csvGame = detectTcgCsvGame(opts.category, opts.name, opts.set);
    if (csvGame) {
      const csv = await fetchTcgCsvMatches(csvGame, opts);
      const merged = mergeMatches(catalog, csv);
      if (merged.length) return merged;
    }
    const game = detectGame(opts.category, opts.name, opts.set);
    if (game === "mtg") return mergeMatches(catalog, await fetchMtgMatches(opts));
    if (game === "yugioh") return mergeMatches(catalog, await fetchYugiohMatches(opts));
    const safeName = cleanSearchText(opts.name).replace(/"/g, "");
    const safeSet = cleanSearchText(opts.set).replace(/"/g, "");
    const safeNumber = cardNumberBase(opts.number).replace(/"/g, "");
    if (!safeName && !safeSet && !safeNumber) return catalog;
    if (game === "unknown" && safeName) {
      const pkmn = await fetchPokemonMatches(safeName, safeSet, safeNumber);
      const mergedPkmn = mergeMatches(catalog, pkmn);
      if (mergedPkmn.length) return mergedPkmn;
      const mtg = await fetchMtgMatches(opts);
      if (mtg.length) return mergeMatches(catalog, mtg);
      const ygo = await fetchYugiohMatches(opts);
      if (ygo.length) return mergeMatches(catalog, ygo);
      // Last resort: try every TCGCSV game by name
      for (const g of ["One Piece", "Lorcana", "Dragon Ball Super Fusion", "Star Wars Unlimited", "Flesh and Blood"]) {
        const r = await fetchTcgCsvMatches(g, opts);
        if (r.length) return mergeMatches(catalog, r);
      }
      return catalog;
    }
    return mergeMatches(catalog, await fetchPokemonMatches(safeName, safeSet, safeNumber));
  }

  async function fetchPokemonMatches(safeName: string, safeSet: string, safeNumber: string): Promise<Alt[]> {
    // Build a wildcard token query so partial names match (e.g. "Mega Lucario"
    // or "Lucario EX" both find "Mega Lucario ex"). pokemontcg.io Lucene treats
    // each `name:token*` as an AND term across the card name.
    const nameWild = safeName
      ? safeName.split(/\s+/).filter(Boolean).map((w) => `name:*${w}*`).join(" ")
      : "";
    const queries = [
      [nameWild, safeNumber && `number:"${safeNumber}"`].filter(Boolean).join(" "),
      [safeName && `name:"${safeName}"`, safeNumber && `number:"${safeNumber}"`].filter(Boolean).join(" "),
      [safeNumber && `number:"${safeNumber}"`, safeSet && `set.name:"${safeSet}"`].filter(Boolean).join(" "),
      [nameWild, safeSet && `set.name:"${safeSet}"`].filter(Boolean).join(" "),
      [nameWild].filter(Boolean).join(" "),
      [safeNumber && `number:"${safeNumber}"`].filter(Boolean).join(" "),
    ].filter(Boolean);
    try {
      const rows: any[] = [];
      const seen = new Set<string>();
      for (const q of queries) {
        const r = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&pageSize=12&orderBy=-set.releaseDate`, { headers: { Accept: "application/json" } });
        if (!r.ok) continue;
        const j = await r.json();
        for (const c of j?.data || []) {
          if (!c?.id || seen.has(c.id)) continue;
          seen.add(c.id); rows.push(c);
        }
        if (rows.length >= 12) break;
      }
      const score = (c: any) => {
        const cName = String(c?.name || "").toLowerCase();
        const cSet = String(c?.set?.name || "").toLowerCase();
        const cNumber = cardNumberBase(c?.number).toLowerCase();
        let s = 0;
        if (safeNumber && cNumber === safeNumber.toLowerCase()) s += 8;
        if (safeName && cName === safeName.toLowerCase()) s += 6;
        if (safeSet && cSet.includes(safeSet.toLowerCase())) s += 4;
        if (c?.images?.large || c?.images?.small) s += 1;
        return s;
      };
      return rows.sort((a, b) => score(b) - score(a)).map((c: any) => {
        const prices: TcgPrices = c.tcgplayer?.prices || {};
        const tcgMarket =
          prices.holofoil?.market ??
          prices.normal?.market ??
          prices.reverseHolofoil?.market ??
          prices["1stEditionHolofoil"]?.market ??
          prices["1stEditionNormal"]?.market ??
          prices["1stEdition"]?.market ??
          prices["unlimited"]?.market ??
          prices["unlimitedHolofoil"]?.market;
        // Cardmarket fallback for vintage cards with no TCGplayer market data
        const cm = c.cardmarket?.prices || {};
        const cmMarket = Number(cm.trendPrice) || Number(cm.averageSellPrice) || Number(cm.avg30) || undefined;
        const price = Number(tcgMarket) || cmMarket;
        return {
          id: c.id,
          name: c.name,
          set: c.set?.name,
          number: c.number,
          image: c.images?.large || c.images?.small,
          price: Number(price) || undefined,
          year: c.set?.releaseDate ? String(c.set.releaseDate).slice(0, 4) : undefined,
          category: "Pokémon",
          tcgPrices: prices,
        };
      }) as Alt[];
    } catch { return []; }
  }

  // Pick the right tcgplayer price slot based on edition + finish (with fallbacks).
  // 1st Edition always applies at least a 2.5x premium over any available Unlimited slot.
  function finishPremium(fin: Finish): number {
    return fin === "Holo" ? 1.35 : fin === "Reverse Holo" ? 1.18 : 1;
  }

  function editionPremium(ed: Edition): number {
    return ed === "1st Edition" ? 2.5 : 1;
  }

  function priceFromVariant(
    prices: TcgPrices | undefined,
    ed: Edition,
    fin: Finish,
  ): number | undefined {
    if (!prices) return undefined;
    const get = (k: string) => Number(prices[k]?.market) || undefined;
    // Try exact slot first, then vintage-style aliases used by older Pokémon sets.
    const exactKeys: string[] =
      ed === "1st Edition"
        ? fin === "Non-Holo"
          ? ["1stEditionNormal", "1stEdition"]
          : fin === "Holo"
            ? ["1stEditionHolofoil", "1stEdition"]
            : ["1stEditionHolofoil", "1stEdition"]
        : fin === "Non-Holo"
          ? ["normal", "unlimited"]
          : fin === "Holo"
            ? ["holofoil", "unlimitedHolofoil", "unlimited"]
            : ["reverseHolofoil"];
    for (const k of exactKeys) {
      const v = get(k);
      if (v) return v;
    }

    // Fall back to any populated price, then rebase via edition/finish premiums.
    const sources: Array<{ key: string; ed: Edition; fin: Finish }> = [
      { key: "normal", ed: "Unlimited", fin: "Non-Holo" },
      { key: "unlimited", ed: "Unlimited", fin: "Holo" },
      { key: "holofoil", ed: "Unlimited", fin: "Holo" },
      { key: "unlimitedHolofoil", ed: "Unlimited", fin: "Holo" },
      { key: "reverseHolofoil", ed: "Unlimited", fin: "Reverse Holo" },
      { key: "1stEdition", ed: "1st Edition", fin: "Holo" },
      { key: "1stEditionNormal", ed: "1st Edition", fin: "Non-Holo" },
      { key: "1stEditionHolofoil", ed: "1st Edition", fin: "Holo" },
    ];
    const source =
      sources.find((s) => s.fin === fin && get(s.key)) ?? sources.find((s) => get(s.key));
    if (!source) return undefined;
    const sourcePrice = get(source.key);
    if (!sourcePrice) return undefined;
    const baseUnlimitedNonHolo =
      sourcePrice / (editionPremium(source.ed) * finishPremium(source.fin));
    return Math.round(baseUnlimitedNonHolo * editionPremium(ed) * finishPremium(fin) * 100) / 100;
  }

  function confirmedByValue(kind: "auto" | "manual" = "manual") {
    return kind;
  }

  function applyAlternative(alt: Alt, ed: Edition = edition, fin: Finish = finish) {
    setName(alt.name);
    if (alt.set) setTcgSet(alt.set);
    if (alt.number) setTcgNumber(alt.number);
    if (alt.image) setImageUrl(alt.image);
    if (alt.year) setTcgYear(alt.year);
    if (alt.category) setCategory(alt.category);
    // Auto-suggest finish based on what prices the card actually has
    if (alt.tcgPrices) {
      const has = (k: string) => Number(alt.tcgPrices?.[k]?.market) > 0;
      if (fin === "Non-Holo" && !has("normal") && !has("1stEditionNormal") && (has("holofoil") || has("1stEditionHolofoil"))) {
        fin = "Holo";
        setFinish("Holo");
      }
    }
    const variantPrice = priceFromVariant(alt.tcgPrices, ed, fin) ?? alt.price;
    const cp = conditionPricesFromMarket(variantPrice);
    if (cp) { setCondPrices(cp); setEstValue(String(priceFor(condition, cp.NM || variantPrice || 0, cp))); }
    const idx = alternatives.findIndex((a) => a.id === alt.id);
    if (idx >= 0) setAltIndex(idx);
  }

  function cycleAlternative(dir: 1 | -1) {
    if (!alternatives.length) return;
    const next = (altIndex + dir + alternatives.length) % alternatives.length;
    applyAlternative(alternatives[next]);
  }

  async function load() {
    if (!user) return;
    const [{ data }, { data: vs }] = await Promise.all([
      supabase.from("vault_cards").select("*").eq("user_id", user.id).neq("status", "sold").order("created_at", { ascending: false }),
      supabase.from("vault_settings").select("visibility").eq("user_id", user.id).maybeSingle(),
    ]);
    const list = (data || []) as Card[];
    setCards(list);
    if (vs?.visibility) setVaultVisibility(vs.visibility as Visibility);
    // Background backfill: replace missing/generated/uploaded placeholders with official card images when we can match them.
    backfillMissingImages(list);
    // Re-price cards that look stuck at the $0.50 floor (no real market data captured).
    backfillMissingPrices(list);
    // Retroactively enrich pricing (source, confidence, timestamp) for cards missing a source.
    enrichPrices(list);
  }

  async function backfillMissingPrices(list: Card[]) {
    const stale = list.filter((c) => {
      // A user-confirmed card is permanently linked to its chosen identity. Never
      // re-derive its price from the live recommendation list (matches[0]) — that
      // is exactly the "confirmed card still behaves like a suggestion" bug.
      if (isUserVerified(c)) return false;
      const v = Number(c.estimated_value || 0);
      const cp = c.condition_prices as any;
      const cpEmpty = !cp || ((Number(cp.NM) || 0) === 0 && (Number(cp.LP) || 0) === 0);
      return v <= 0.5 && cpEmpty && (c.name || c.tcg_number || c.tcg_set);
    });
    if (!stale.length) return;
    let updated = 0;
    for (const c of stale.slice(0, 25)) {
      const matches = await fetchRealCardMatches({ name: c.name, set: c.tcg_set || undefined, number: c.tcg_number || undefined, category: c.category || undefined });
      const best = matches[0];
      if (!best) continue;
      const v = parseVariant(c.description);
      const langCode = parseLanguage(c.description);
      const mult = langMult(langCode);
      const raw = priceFromVariant(best.tcgPrices, v.edition, v.finish) ?? best.price;
      const variantPrice = raw != null ? Number(raw) * mult : raw;
      const marketCp = conditionPricesFromMarket(variantPrice);
      if (!marketCp) continue;
      const newValue = priceFor((c.condition || "NM") as Condition, marketCp.NM || variantPrice || 0, marketCp);
      const patch = {
        condition_prices: marketCp as any,
        estimated_value: newValue,
        last_valued_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("vault_cards").update(patch).eq("id", c.id);
      if (!error) {
        updated++;
        setCards((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
        setActionFor((prev) => (prev && prev.id === c.id ? { ...prev, ...patch } : prev));
      }
    }
    if (updated > 0) toast.success(`Updated values on ${updated} card${updated > 1 ? "s" : ""}`);
  }

  // Backfills display images for existing inventory while preserving the user's
  // original upload as secondary proof/sale media.
  async function backfillMissingImages(list: Card[], force = false) {
    const missing = list.filter((c) => {
      // A user-confirmed card owns its image, identity and price. Never re-match
      // it against the live recommendation list — that re-introduces suggestion
      // data (wrong image/set/number) onto a card the collector already locked.
      if (!force && isUserVerified(c)) return false;
      return (force || needsOfficialCardImage(c.image_url) || !c.ai_image_url) && (c.name || c.tcg_number || c.tcg_set);
    });
    if (!missing.length) {
      if (force) toast.info("All cards already have images");
      return;
    }
    if (force) { setEnriching(true); toast.info(`Generating images for ${missing.length} card${missing.length > 1 ? "s" : ""}…`); }
    let updated = 0;
    for (const c of missing.slice(0, force ? 200 : 25)) {
      const original = c.original_image_url || (looksLikeUserUpload(c.image_url) ? c.image_url : null);
      const confirmed = isUserVerified(c);
      // For a confirmed card we NEVER pull identity/price from the recommendation
      // list — we only generate a display image keyed on its own locked identity.
      const matches = confirmed ? [] : await fetchRealCardMatches({ name: c.name, set: c.tcg_set || undefined, number: c.tcg_number || undefined, category: c.category || undefined });
      const match = matches.find((m) => m.image);
      const catalogImg = match?.image || null;
      let aiImg = c.ai_image_url || null;
      // Generate AI images for every legacy card that does not already have one;
      // keep catalog/user photos in the gallery as secondary references.
      if ((force || !aiImg) && c.name) {
        try {
          const { data: gen } = await supabase.functions.invoke("generate-card-image", {
            body: { name: c.name, category: c.category || undefined, set: c.tcg_set || undefined, year: c.tcg_year || undefined, tcg_number: c.tcg_number || undefined },
          });
          if (gen?.image) aiImg = gen.image;
        } catch { /* ignore */ }
      }
      const img = aiImg || catalogImg;
      if (!img) continue;
      const cp = !confirmed ? (conditionPricesFromMarket(match?.price) || c.condition_prices || null) : (c.condition_prices || null);
      const newValue = !confirmed && isSafePriced(c) && cp ? priceFor((c.condition || "NM") as Condition, Number(cp.NM) || Number(match?.price) || 0, cp) : c.estimated_value;
      const patch = {
        image_url: img,
        original_image_url: original,
        ai_image_url: aiImg,
        image_source: aiImg ? "ai_generated" : "catalog",
        image_gallery: [
          { url: img, type: aiImg ? "ai_generated" : "catalog", primary: true },
          original ? { url: original, type: "user_upload", primary: false } : null,
          c.back_image_url ? { url: c.back_image_url, type: "user_back", primary: false } : null,
        ].filter(Boolean),
        // Identity stays locked for confirmed cards — only suggestions may be
        // re-derived from the catalog match.
        name: confirmed ? c.name : (match?.name || c.name),
        tcg_set: confirmed ? c.tcg_set : (match?.set || c.tcg_set),
        tcg_number: confirmed ? c.tcg_number : (match?.number || c.tcg_number),
        tcg_year: confirmed ? c.tcg_year : (match?.year || c.tcg_year),
        category: confirmed ? c.category : (match?.category || c.category || "Pokémon"),
        condition_prices: cp as any,
        estimated_value: newValue,
        last_rescan_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", c.id);
      if (!error) {
        updated++;
        setCards((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch, condition_prices: cp } : x)));
        setActionFor((prev) => (prev && prev.id === c.id ? { ...prev, ...patch, condition_prices: cp } : prev));
      }
    }
    if (force) setEnriching(false);
    if (updated > 0) toast.success(`Added images to ${updated} card${updated > 1 ? "s" : ""}`);
  }

  // Retroactive rescan + pricing enrichment. It only assigns Vault value after
  // exact structured identity is known; otherwise cards are flagged for review.
  async function enrichPrices(list: Card[], force = false) {
    const targets = list.filter((c) => {
      // Never re-price or re-flag a card the user has explicitly confirmed.
      if (c.price_locked || isUserVerified(c)) return false;
      if (force) return !!(c.name || c.tcg_number || c.tcg_set);
      const stale = !c.price_source || !c.price_updated_at;
      return stale && !!(c.name || c.tcg_number || c.tcg_set);
    });
    if (!targets.length) {
      if (force) toast.info("Prices are already up to date");
      return;
    }
    if (force) { setEnriching(true); toast.info(`Refreshing ${targets.length} card${targets.length > 1 ? "s" : ""}…`); }
    let updated = 0;
    for (const c of targets.slice(0, force ? 200 : 25)) {
      try {
        const { data, error } = await supabase.functions.invoke("card-price", {
          body: {
            name: c.name, set: c.tcg_set || undefined, number: c.tcg_number || undefined,
            year: c.tcg_year || undefined, category: c.category || undefined, game: categoryToGameId(c.category),
            language: c.language || parseLanguage(c.description),
            variant: c.variant || parseVariant(c.description).finish, skip_cache: true,
          },
        });
        if (error) continue;
        const market = Number(data?.price?.market) || 0;
        const matched = data?.card || null;
        const identity = {
          name: matched?.name || c.name,
          tcg_set: matched?.set_name || c.tcg_set,
          tcg_number: matched?.number || c.tcg_number,
          tcg_year: matched?.year || c.tcg_year,
          rarity: matched?.rarity || c.rarity,
          variant: data?.candidates?.[0]?.variant || c.variant || parseVariant(c.description).finish,
        };
        const confidenceScore = Number(data?.confidence || 0);
        const suspicious = !!data?.price_suspicious;
        const verified = data?.pricing_tier === "verified" && data?.price_confidence !== "low" && !data?.price_is_ai && !suspicious && market > 0 && isCompleteIdentity(identity) && confidenceScore >= 0.7;
        // An identified card should NEVER silently end at $0. When we have any
        // real/estimated/AI market value that isn't flagged as suspicious, store
        // it so the card shows an estimate (clearly badged) instead of nothing.
        // Suspicious values are still withheld — those mean a wrong product match.
        const hasUsableValue = market > 0 && !suspicious;
        const storedValue = hasUsableValue ? market : 0;
        const variantMissing = !identity.variant;
        const reviewReason = verified
          ? null
          : suspicious
            ? (data?.suspicious_reason || "Market value looks wrong — flagged for re-sync.")
            : variantMissing
              ? "Variant not detected — confirm the variant (Full Art, IR, SIR, Promo, Stamped, etc.) to verify this value."
              : !isCompleteIdentity(identity)
                ? "Estimated value shown — confirm exact set, card number, year, and rarity to verify it."
                : data?.tier_reason || "Estimated value shown — confirm the card to verify it.";
        const patch: any = {
          market_price: market,
          estimated_value: storedValue,
          condition_prices: storedValue > 0 ? conditionPricesFromMarket(storedValue) : null,
          price_source: data?.primary_source || null,
          price_source_url: data?.market_source?.tcgplayer_url || data?.market_source?.pricecharting_url || null,
          price_confidence: data?.price_confidence || null,
          price_is_ai: !!data?.price_is_ai,
          price_tier: suspicious ? "estimated" : (data?.pricing_tier || "unavailable"),
          price_range_low: data?.price_range?.low ?? null,
          price_range_high: data?.price_range?.high ?? null,
          price_updated_at: new Date().toISOString(),
          last_valued_at: new Date().toISOString(),
          last_rescan_at: new Date().toISOString(),
          confidence_score: confidenceScore || null,
          needs_review: !verified,
          review_reason: reviewReason,
          pricing_details: { market_source: data?.market_source || null, suspicious, reference_value: data?.reference_value ?? null },
          identification_details: { pricing: data, identity },
          name: identity.name,
          tcg_set: identity.tcg_set || null,
          tcg_number: identity.tcg_number || null,
          tcg_year: identity.tcg_year || null,
          rarity: identity.rarity || null,
          variant: identity.variant || null,
          image_url: data?.official_image_url || c.ai_image_url || c.image_url,
          image_source: data?.official_image_url ? data?.image_source || "catalog" : c.image_source,
        };
        const { error: upErr } = await supabase.from("vault_cards").update(patch as never).eq("id", c.id);
        if (upErr) continue;
        updated++;
        setCards((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
        setActionFor((prev) => (prev && prev.id === c.id ? { ...prev, ...patch } : prev));
      } catch { /* keep going */ }
    }
    if (force) setEnriching(false);
    if (updated > 0) toast.success(`Repriced ${updated} card${updated > 1 ? "s" : ""}`);
  }
  useEffect(() => { load(); }, [user]);

  async function updateVaultVisibility(v: Visibility) {
    if (!user) return;
    setVaultVisibility(v);
    setSavingVis(true);
    const { error } = await supabase.from("vault_settings").upsert({ user_id: user.id, visibility: v, updated_at: new Date().toISOString() });
    setSavingVis(false);
    if (error) toast.error(error.message);
    else toast.success(v === "private" ? "Vault is private" : `Vault visible to ${v}`);
  }

  // "Wrong Match" / "Fix match" → open the visual matcher instead of forcing
  // the user to type metadata. They simply tap the correct card image.
  function openMatchPicker(card: Card) {
    setMatchingCard(card);
  }

  // Apply a user-confirmed visual match: update metadata, re-price, refresh the
  // card image, clear the Needs-Review flag and recalculate the vault total.
  async function applyMatch(card: Card, m: MatchOption) {
    const tId = toast.loading("Updating card…");
    try {
      const original = card.original_image_url || (looksLikeUserUpload(card.image_url) ? card.image_url : null);
      const v = parseVariant(card.description);
      const langCode = card.language || parseLanguage(card.description);
      let mult = langMult(langCode);
      let raw = priceFromVariant(m.tcgPrices, v.edition, v.finish) ?? m.price;
      let pricePayload: any = null;
      // The catalog match may not carry an embedded price (common for newer
      // sets and non-Pokémon games). Fetch a live market value immediately so a
      // confirmed card never ends up locked at $0 (this was the Clefairy bug).
      // Always re-price the exact selected catalog ID; embedded search prices
      // can be stale/wrong variant records (e.g. Clefairy #94 showing $0.75).
      try {
        const { data: pd } = await supabase.functions.invoke("card-price", {
          body: {
            card_id: m.id && !String(m.id).startsWith("csv-") ? m.id : undefined,
            name: m.name || card.name, set: m.set || card.tcg_set || undefined,
            number: m.number || card.tcg_number || undefined,
            year: m.year || card.tcg_year || undefined,
            category: m.category || card.category || undefined,
            game: categoryToGameId(m.category || card.category),
            language: langCode,
            variant: card.variant || v.finish, skip_cache: true,
          },
        });
        pricePayload = pd || null;
        // Real language-specific market value → use it as-is (no multiplier).
        mult = effectiveLangMult(langCode, pricePayload);
        const mk = Number(pd?.price?.market) || 0;
        if (mk > 0 && !pd?.price_suspicious) raw = mk;
      } catch { /* fall through to embedded price / unavailable */ }
      const variantPrice = raw != null ? Number(raw) * mult : raw;
      const cp = conditionPricesFromMarket(variantPrice);
      const newValue = cp ? priceFor((card.condition || "NM") as Condition, Number(cp.NM) || Number(variantPrice) || 0, cp) : 0;
      const hasPrice = newValue > 0;
      const marketSource = pricePayload?.market_source || null;

      // Prefer the real catalog image; generate AI art only if there is none.
      let primaryImg = m.image || null;
      if (!primaryImg && m.name) {
        try {
          const { data: gen } = await supabase.functions.invoke("generate-card-image", {
            body: { name: m.name, category: m.category || card.category, set: m.set, year: m.year, tcg_number: m.number },
          });
          if (gen?.image) primaryImg = gen.image;
        } catch { /* ignore */ }
      }

      const patch: any = {
        name: m.name || card.name,
        category: m.category || card.category || "Trading Card",
        tcg_set: m.set || card.tcg_set,
        tcg_number: m.number || card.tcg_number,
        tcg_year: m.year || card.tcg_year,
        rarity: m.rarity || card.rarity,
        language: langCode,
        image_url: primaryImg || card.image_url,
        ai_image_url: primaryImg || card.ai_image_url,
        original_image_url: original,
        image_source: m.image ? "catalog" : primaryImg ? "ai_generated" : card.image_source,
        image_gallery: [
          primaryImg ? { url: primaryImg, type: m.image ? "catalog" : "ai_generated", primary: true } : null,
          original ? { url: original, type: "user_upload", primary: false } : null,
          card.back_image_url ? { url: card.back_image_url, type: "user_back", primary: false } : null,
        ].filter(Boolean),
        estimated_value: newValue,
        market_price: Number(variantPrice) || null,
        condition_prices: cp as any,
        // Save the actual catalog card ID so pricing + history always resolve.
        card_identity_id: m.id || card.card_identity_id || null,
        // Master identity UUID (card-info source of truth) from the price engine.
        master_identity_id: pricePayload?.master_identity_id || card.master_identity_id || null,
        price_source: pricePayload?.primary_source || "user_confirmed",
        price_source_url: marketSource?.tcgplayer_url || marketSource?.pricecharting_url || null,
        price_confidence: hasPrice ? "high" : "low",
        price_is_ai: false,
        price_tier: hasPrice ? "verified" : "unavailable",
        price_range_low: pricePayload?.price_range?.low ?? null,
        price_range_high: pricePayload?.price_range?.high ?? null,
        confidence_score: 0.97,
        // User explicitly confirmed this card — identity is locked and never
        // re-enters review. If a price was found we lock it too; if not, we
        // leave it unlocked so the "Retry pricing" button can fill it in.
        needs_review: false,
        review_reason: hasPrice ? null : "Market value unavailable — tap Retry pricing.",
        confirmed_by: confirmedByValue("manual"),
        // Confirming the identity is not a manual price override. Keep market
        // pricing refreshable so vault totals and charts keep moving over time.
        price_locked: false,
        price_updated_at: new Date().toISOString(),
        last_valued_at: new Date().toISOString(),
        last_rescan_at: new Date().toISOString(),
        pricing_details: { market_source: marketSource, suspicious: !!pricePayload?.price_suspicious, reference_value: pricePayload?.reference_value ?? null, language: langCode, language_matched: !!pricePayload?.language_matched, language_unconfirmed: !!pricePayload?.language_unconfirmed },
        identification_details: { confirmed_match: m, pricing: pricePayload },
        incorrect_price_reported: false,
        incorrect_price_reported_at: null,
        match_history: [
          ...(Array.isArray(card.match_history) ? card.match_history : []),
          { from: card.name || "Unknown", to: m.name || card.name || "Unknown", by: "User", at: new Date().toISOString() },
        ],
      };
      const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", card.id);
      if (error) throw error;
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
      setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, ...patch } : prev));
      if (!patch.master_identity_id) {
        void ensureMasterIdentity(card.id, {
          category: patch.category, name: patch.name, tcg_set: patch.tcg_set,
          tcg_number: patch.tcg_number, tcg_year: patch.tcg_year, variant: card.variant,
          language: langCode, rarity: patch.rarity, image_url: patch.image_url,
          card_identity_id: patch.card_identity_id, confidence_score: 0.97,
        });
      }
      // The user explicitly confirmed this match — close the picker so they
      // land back on the (now-verified) card with no lingering "Fix" prompt.
      setMatchingCard(null);
      toast.success(hasPrice ? `Matched • $${newValue.toFixed(2)}` : "Matched — tap Retry pricing for market value", { id: tId });
    } catch (e: any) {
      toast.error(e?.message || "Could not update card", { id: tId });
    }
  }

  // Re-fetch a live market value for a single confirmed card on demand. Used by
  // the "Retry pricing" button so a card is never silently left without a value.
  async function retryPricing(card: Card) {
    const tId = toast.loading("Fetching market value…");
    try {
      const v = parseVariant(card.description);
      const langCode = card.language || parseLanguage(card.description);
      const { data } = await supabase.functions.invoke("card-price", {
        body: {
          name: card.name, set: card.tcg_set || undefined, number: card.tcg_number || undefined,
          year: card.tcg_year || undefined, category: card.category || undefined,
          game: categoryToGameId(card.category), language: langCode,
          variant: card.variant || v.finish, skip_cache: true,
        },
      });
      const market = Number(data?.price?.market) || 0;
      const suspicious = !!data?.price_suspicious;
      if (market <= 0) {
        await supabase.from("vault_cards").update({ review_reason: "Market value unavailable — try again later.", price_updated_at: new Date().toISOString() } as never).eq("id", card.id);
        setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, price_updated_at: new Date().toISOString() } : c)));
        toast.error("Market value still unavailable", { id: tId });
        return;
      }
      const marketSource = data?.market_source || null;
      if (suspicious) {
        // The fetched value disagrees sharply with comps/recent sales — never
        // lock a bogus number. Flag for review and surface the reason instead.
        const patch: any = {
          market_price: market, estimated_value: 0, condition_prices: null,
          price_tier: "estimated", price_confidence: "low", price_is_ai: false,
          price_source: data?.primary_source || null,
          price_source_url: marketSource?.tcgplayer_url || marketSource?.pricecharting_url || null,
          price_locked: false, needs_review: true,
          review_reason: data?.suspicious_reason || "Market value looks wrong — flagged for re-sync.",
          pricing_details: { market_source: marketSource, suspicious: true, reference_value: data?.reference_value ?? null },
          price_updated_at: new Date().toISOString(), last_valued_at: new Date().toISOString(),
        };
        const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", card.id);
        if (error) throw error;
        setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
        setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, ...patch } : prev));
        toast.warning("Value looks wrong — flagged for re-sync", { id: tId });
        return;
      }
      const mult = effectiveLangMult(langCode, data);
      const priced = market * mult;
      const cp = conditionPricesFromMarket(priced);
      const newValue = cp ? priceFor((card.condition || "NM") as Condition, Number(cp.NM) || priced, cp) : priced;
      // master_identity_id = card-info source of truth (UUID).
      // card_identity_id = provider/market key (drives pricing + propagation).
      const masterId = data?.master_identity_id || card.master_identity_id || null;
      const providerKey = data?.provider_key || card.card_identity_id || null;
      const patch: any = {
        estimated_value: newValue, market_price: priced, condition_prices: cp,
        price_tier: "verified", price_confidence: "high", price_is_ai: false,
        price_source: "user_confirmed", price_locked: false,
        card_identity_id: providerKey,
        master_identity_id: masterId,
        price_source_url: marketSource?.tcgplayer_url || marketSource?.pricecharting_url || null,
        pricing_details: { market_source: marketSource, suspicious: false, reference_value: data?.reference_value ?? null, language: langCode, language_matched: !!data?.language_matched, language_unconfirmed: !!data?.language_unconfirmed },
        needs_review: false, review_reason: null,
        price_updated_at: new Date().toISOString(), last_valued_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", card.id);
      if (error) throw error;
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
      setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, ...patch } : prev));
      // Price belongs to the card: push the new value to every other owner.
      // Propagation keys off the provider/market key (working pricing path).
      if (providerKey) {
        propagatePrice({ data: { identityId: providerKey, marketPrice: priced, source: "user_confirmed", verified: true } })
          .then((r: any) => { if (r?.updated > 1) toast.message(`Updated ${r.updated} collections owning this card`); })
          .catch(() => {});
      }
      toast.success(`Updated • $${newValue.toFixed(2)}`, { id: tId });
    } catch (e: any) {
      toast.error(e?.message || "Could not fetch price", { id: tId });
    }
  }
  // ever persist an unverified record, run one more identification pass against
  // the card databases using whatever the collector typed. If a single
  // confident match exists, replace the manual record with the verified card
  // (official image, metadata, pricing). Otherwise fall back to saving exactly
  // what they entered.
  async function applyManual(card: Card, f: ManualCardEntry) {
    const tId = toast.loading("Searching card databases…");
    try {
      // 1) Try to identify the card from the entered details.
      let matches: MatchOption[] = [];
      try {
        matches = (await fetchRealCardMatches({
          name: f.name || card.name || undefined,
          set: f.set || card.tcg_set || undefined,
          number: f.number || card.tcg_number || undefined,
          category: f.category || card.category || undefined,
        })) as MatchOption[];
      } catch { matches = []; }

      // 2) Single confident match → auto-apply the verified card.
      if (matches.length === 1) {
        toast.dismiss(tId);
        await applyMatch(card, matches[0]);
        return;
      }
      // 3) Multiple matches → let the user tap the correct card image.
      if (matches.length > 1) {
        toast.dismiss(tId);
        toast.message("Found possible matches — tap the correct card");
        // Seed the picker with the entered details so the grid is pre-populated.
        setMatchingCard({
          ...card,
          name: f.name || card.name,
          tcg_set: f.set || card.tcg_set,
          tcg_number: f.number || card.tcg_number,
          category: f.category || card.category,
        } as Card);
        return;
      }

      // 4) Nothing found in any catalog → still try a live pricing lookup so a
      // manually-entered card isn't permanently stuck at $0. Manual entry must
      // trigger pricing, never bypass it.
      let marketPrice: number | null = null;
      let conditionPrices: any = null;
      let estimatedValue = 0;
      let priceSourceUrl: string | null = null;
      try {
        const { data: pd } = await supabase.functions.invoke("card-price", {
          body: {
            name: f.name || card.name,
            set: f.set || card.tcg_set || undefined,
            number: f.number || card.tcg_number || undefined,
            year: f.year || card.tcg_year || undefined,
            category: f.category || card.category || undefined,
            game: categoryToGameId(f.category || card.category),
            language: card.language || parseLanguage(card.description),
            variant: f.variant || card.variant || undefined,
            skip_cache: true,
          },
        });
        const mk = Number(pd?.price?.market) || 0;
        if (mk > 0 && !pd?.price_suspicious) {
          const mult = effectiveLangMult(card.language || parseLanguage(card.description), pd);
          marketPrice = mk * mult;
          conditionPrices = conditionPricesFromMarket(marketPrice);
          estimatedValue = conditionPrices
            ? priceFor(((f.condition as Condition) || card.condition || "NM") as Condition, Number(conditionPrices.NM) || marketPrice, conditionPrices)
            : marketPrice;
          priceSourceUrl = pd?.market_source?.tcgplayer_url || pd?.market_source?.pricecharting_url || null;
        }
      } catch { /* leave unpriced — user can tap Retry pricing */ }

      const hasPrice = estimatedValue > 0;
      const patch: any = {
        name: f.name || card.name,
        category: f.category || card.category || "Trading Card",
        tcg_set: f.set || card.tcg_set,
        tcg_number: f.number || card.tcg_number,
        tcg_year: f.year || card.tcg_year,
        rarity: f.rarity || card.rarity,
        variant: f.variant || card.variant,
        condition: (f.condition as Condition) || card.condition || "NM",
        description: f.notes ? f.notes : card.description,
        estimated_value: estimatedValue,
        market_price: marketPrice,
        condition_prices: conditionPrices,
        price_source: hasPrice ? "manual_entry_priced" : "manual_entry",
        price_source_url: priceSourceUrl,
        price_confidence: hasPrice ? "high" : "low",
        price_is_ai: false,
        price_tier: hasPrice ? "verified" : "unavailable",
        confidence_score: 1,
        needs_review: false,
        review_reason: hasPrice ? null : "Market value unavailable — tap Retry pricing.",
        confirmed_by: confirmedByValue("manual"),
        // Only lock the price if we actually found one; otherwise leave it open
        // so "Retry pricing" can fill it in later.
        price_locked: false,
        price_updated_at: new Date().toISOString(),
        last_valued_at: new Date().toISOString(),
        last_rescan_at: new Date().toISOString(),
        incorrect_price_reported: false,
        incorrect_price_reported_at: null,
        match_history: [
          ...(Array.isArray(card.match_history) ? card.match_history : []),
          { from: card.name || "Unknown", to: f.name || card.name || "Unknown", by: "Manual", at: new Date().toISOString() },
        ],
      };
      const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", card.id);
      if (error) throw error;
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
      setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, ...patch } : prev));
      setMatchingCard(null);
      toast.success(hasPrice ? `Card saved • $${estimatedValue.toFixed(2)}` : "Card saved — tap Retry pricing for market value", { id: tId });
    } catch (e: any) {
      toast.error(e?.message || "Could not save card", { id: tId });
    }
  }

  // Cards that belong in the review queue: low confidence / missing metadata /
  // unverified pricing / missing AI card image.
  const reviewCards = useMemo(
    () => cards.filter((c) =>
      // Cards the user already confirmed (or that are price-locked via manual
      // entry / override) are settled forever — never surface them again.
      !isUserVerified(c) && (
        c.needs_review ||
        !isSafePriced(c) ||
        needsOfficialCardImage(c.image_url) ||
        !c.tcg_set || !c.tcg_number || !c.tcg_year
      )
    ),
    [cards]
  );

  // A card counts toward vault value if it's verified-priced OR a user-confirmed
  // card that now has a real value (so manual corrections are always included).
  const hasMarketValue = (c: Card) => isSafePriced(c) || (isUserVerified(c) && Number(c.estimated_value || 0) > 0);

  const totalValue = useMemo(
    () => cards.reduce((s, c) => s + (hasMarketValue(c) ? Number(c.estimated_value || 0) : 0), 0),
    [cards]
  );

  // Pricing diagnostics shown at the top of the vault.
  const pricingDiagnostics = useMemo(() => {
    const total = cards.length;
    const withValue = cards.filter(hasMarketValue).length;
    const awaiting = cards.filter((c) => !hasMarketValue(c) && !c.price_updated_at && !isUserVerified(c)).length;
    const missing = total - withValue - awaiting;
    return { total, withValue, missing: Math.max(0, missing), awaiting };
  }, [cards]);

  // Total amount the owner actually paid (purchase cost) and overall profit/loss.
  const totalPurchase = useMemo(
    () => cards.reduce((s, c) => s + (c.purchase_price != null ? Number(c.purchase_price) : 0), 0),
    [cards]
  );
  const totalProfit = useMemo(() => totalValue - totalPurchase, [totalValue, totalPurchase]);

  // Record one vault-value snapshot per day so the growth chart accrues history
  // even on days the daily cron didn't run for this user. Owner-only (RLS).
  useEffect(() => {
    if (!user?.id) return;
    if (cards.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const flag = `pbl_vault_snapshot_${user.id}_${today}`;
    try { if (localStorage.getItem(flag)) return; } catch {}
    (async () => {
      const { error } = await supabase
        .from("vault_value_snapshots")
        .upsert(
          { user_id: user.id, snapshot_date: today, total_value: totalValue, total_cost: totalPurchase, card_count: cards.length },
          { onConflict: "user_id,snapshot_date" }
        );
      if (!error) { try { localStorage.setItem(flag, "1"); } catch {} }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, cards.length, totalValue, totalPurchase]);

  // Review-queue breakdown shown at the top of the Vault.
  const reviewSummary = useMemo(() => ({
    needsReview: cards.filter((c) => c.needs_review).length,
    missingImages: cards.filter((c) => needsOfficialCardImage(c.image_url) && !c.ai_image_url).length,
    lowConfidence: cards.filter((c) => Number(c.confidence_score || 0) < 0.7).length,
    missingMetadata: cards.filter((c) => !c.tcg_set || !c.tcg_number || !c.tcg_year || !c.rarity || !c.variant).length,
    incorrectPrices: cards.filter((c) => c.incorrect_price_reported).length,
  }), [cards]);




  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = q
      ? cards.filter((c) =>
          [c.name, c.tcg_set, c.tcg_year, c.tcg_number, c.category]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(q))
        )
      : cards;
    if (reviewOnly) base = base.filter((c) => reviewCards.some((r) => r.id === c.id));
    return [...base].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [cards, query, reviewOnly, reviewCards]);

  // Predictive suggestions for the search box (from existing vault metadata)
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pool = new Set<string>();
    cards.forEach((c) => {
      [c.name, c.tcg_set, c.category, c.tcg_number].forEach((v) => {
        if (v && String(v).toLowerCase().startsWith(q) && String(v).toLowerCase() !== q) {
          pool.add(String(v));
        }
      });
    });
    return Array.from(pool).slice(0, 6);
  }, [cards, query]);

  function startVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Voice search not supported in this browser"); return; }
    const rec = new SR();
    const langTag: Record<string, string> = { en: "en-US", jp: "ja-JP", kr: "ko-KR", zh: "zh-CN", de: "de-DE", fr: "fr-FR", es: "es-ES", it: "it-IT", pt: "pt-PT", ru: "ru-RU" };
    rec.lang = langTag[language] || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const txt = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setQuery(txt);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }
  function stopVoice() {
    try { recognitionRef.current?.stop?.(); } catch {/* */}
    setListening(false);
  }

  function resetForm() {
    setName(""); setTcgNumber(""); setTcgSet(""); setTcgYear(""); setCategory("");
    setImageUrl(""); setBackImageUrl("");
    setDescription(""); setEstValue(""); setCondPrices(null); setPrice(""); setCondition("NM");
    setAlternatives([]); setAltIndex(0);
    setEdition("Unlimited"); setFinish("Holo");
    setSellAfterSave(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result));
    reader.readAsDataURL(f);
  }

  function priceFor(cond: Condition, base: number, cp: ConditionPrices | null | undefined): number {
    if (cp && cp[cond] && Number(cp[cond])) return Number(cp[cond]);
    const mult = cond === "NM" ? 1 : cond === "LP" ? 0.85 : cond === "MP" ? 0.6 : 0.25;
    return Math.max(0.5, Math.round(base * mult * 100) / 100);
  }

  // Auto-update displayed value when condition changes (uses condition_prices map)
  useEffect(() => {
    if (!condPrices) return;
    const base = Number(condPrices.NM) || 0;
    if (!base) return;
    setEstValue(String(priceFor(condition, base, condPrices)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition, condPrices]);

  // Recompute price when edition/finish changes, using current alternative's TCG prices
  useEffect(() => {
    const alt = alternatives[altIndex];
    if (!alt?.tcgPrices) return;
    const variantPrice = priceFromVariant(alt.tcgPrices, edition, finish) ?? alt.price;
    const cp = conditionPricesFromMarket(variantPrice);
    if (cp) { setCondPrices(cp); setEstValue(String(priceFor(condition, cp.NM || variantPrice || 0, cp))); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edition, finish]);

  async function identifyNow() {
    const hasAny = name.trim() || tcgNumber.trim() || tcgSet.trim();
    if (!hasAny) return toast.error("Enter card name, set, or number first");
    setIdentifying(true);
    try {
      const q = [name, tcgNumber && `#${tcgNumber}`, tcgSet && `set: ${tcgSet}`, tcgYear && `year: ${tcgYear}`].filter(Boolean).join(" ");
      const { data, error } = await supabase.functions.invoke("identify-card", { body: { query: q, language } });
      if (error) throw error;
      if (data?.name) setName(data.name);
      if (data?.category && !category) setCategory(data.category);
      if (data?.set && !tcgSet) setTcgSet(data.set);
      if (data?.year && !tcgYear) setTcgYear(String(data.year));
      if (data?.tcg_number && !tcgNumber) setTcgNumber(data.tcg_number);
      const cp: ConditionPrices | null = data?.condition_prices || null;
      setCondPrices(cp);
      const base = Number(data?.estimated_value) || 0;
      if (base) setEstValue(String(priceFor(condition, base, cp)));
      toast.success(`Identified: ${data?.name || name} • ${data?.set || ""} ${data?.year || ""}`);
      // Try to pull the REAL card image + similar printings from the Pokémon TCG API
      const matches = await fetchRealCardMatches({
        name: data?.name || name,
        set: data?.set || tcgSet,
        number: data?.tcg_number || tcgNumber,
        category: data?.category || category || undefined,
      });
      if (matches.length) {
        setAlternatives(matches);
        setAltIndex(0);
        applyAlternative(matches[0]);
      } else if (!imageUrl) {
        // Fallback: AI-generated artwork only if no real match found
        try {
          const { data: img } = await supabase.functions.invoke("generate-card-image", {
            body: { name: data?.name || name, category: data?.category || category, set: data?.set || tcgSet, year: data?.year || tcgYear, tcg_number: data?.tcg_number || tcgNumber },
          });
          if (img?.image) { setImageUrl(img.image); toast.success("Card image generated"); }
        } catch {/* ignore */}
      }
    } catch (e: any) { toast.error(e?.message || "Identification failed"); }
    finally { setIdentifying(false); }
  }

  async function add() {
    if (!name.trim()) return toast.error("Card name required");
    let finalName = name.trim();
    let value = Number(estValue) || 0;
    let cat = category;
    let cp: ConditionPrices | null = condPrices;
    let setName2 = tcgSet, year2 = tcgYear, num2 = tcgNumber;
    // If value is missing, auto-identify (value cannot be edited manually)
    if (!value) {
      try {
        const q = [name, tcgNumber && `#${tcgNumber}`, tcgSet && `set: ${tcgSet}`, tcgYear && `year: ${tcgYear}`].filter(Boolean).join(" ");
        const { data } = await supabase.functions.invoke("identify-card", { body: { query: q, language } });
        if (data) {
          finalName = data.name || finalName;
          cp = data.condition_prices || null;
          const base = Number(data.estimated_value) || 0;
          value = priceFor(condition, base, cp);
          cat = cat || data.category || "Trading Card";
          setName2 = setName2 || data.set || "";
          year2 = year2 || (data.year ? String(data.year) : "");
          num2 = num2 || data.tcg_number || "";
        }
      } catch {/* ignore */}
    }
    const originalUpload = looksLikeUserUpload(imageUrl) ? imageUrl : null;
    let finalImage = imageUrl;
    let generatedImage: string | null = null;
    const matches = await fetchRealCardMatches({ name: finalName, set: setName2, number: num2, category: cat || undefined });
    if (matches.length) {
      const best = matches[0];
      finalName = best.name || finalName;
      finalImage = best.image || finalImage;
      cat = best.category || cat || "Pokémon";
      setName2 = best.set || setName2;
      year2 = best.year || year2;
      num2 = best.number || num2;
      const variantPrice = priceFromVariant(best.tcgPrices, edition, finish) ?? best.price;
      const marketCp = conditionPricesFromMarket(variantPrice);
      if (marketCp) {
        cp = marketCp;
        value = priceFor(condition, marketCp.NM || variantPrice || value, marketCp);
      }
    }
    if (!finalImage) {
      try {
        const { data: img } = await supabase.functions.invoke("generate-card-image", {
          body: { name: finalName, category: cat, set: setName2, year: year2, tcg_number: num2 },
        });
          if (img?.image) { finalImage = img.image; generatedImage = img.image; }
      } catch {/* ignore */}
    }
    const variantLabel = `${edition} · ${finish}`;
    const fullDesc = [description?.trim(), `Variant: ${variantLabel}`].filter(Boolean).join("\n");
    const completeIdentity = !!(finalName && setName2 && num2 && year2 && (matches[0]?.category || cat));
    if (!completeIdentity) value = 0;
    const { data: inserted, error } = await supabase.from("vault_cards").insert({
      user_id: user!.id, name: finalName, category: cat || "Trading Card",
      image_url: finalImage || null, back_image_url: backImageUrl || null,
      original_image_url: originalUpload,
      ai_image_url: generatedImage,
      image_source: generatedImage ? "ai_generated" : matches[0]?.image ? "catalog" : null,
      image_gallery: [
        finalImage ? { url: finalImage, type: generatedImage ? "ai_generated" : "catalog", primary: true } : null,
        originalUpload ? { url: originalUpload, type: "user_upload", primary: false } : null,
        backImageUrl ? { url: backImageUrl, type: "user_back", primary: false } : null,
      ].filter(Boolean),
      description: fullDesc || null,
      estimated_value: value,
      condition_prices: cp as any,
      price: price ? Number(price) : null,
      tcg_number: num2 || null, tcg_set: setName2 || null, tcg_year: year2 || null,
      condition,
      language,
      rarity: matches[0]?.category ? null : null,
      variant: variantLabel,
      confidence_score: completeIdentity ? 0.75 : 0.35,
      needs_review: !completeIdentity,
      review_reason: completeIdentity ? null : "Missing exact set, card number, year, rarity, or variant.",
      last_valued_at: new Date().toISOString(),
    } as never).select().single();
    if (error) return toast.error(error.message);
    if (inserted) {
      void ensureMasterIdentity((inserted as Card).id, {
        category: cat, name: finalName, tcg_set: setName2, tcg_number: num2,
        tcg_year: year2, variant: variantLabel, language, rarity: null,
        image_url: finalImage, confidence_score: completeIdentity ? 0.75 : 0.35,
      });
    }
    const wantSell = sellAfterSave;
    resetForm(); setShowAdd(false);
    load();
    if (wantSell && inserted) {
      setSelling(inserted as Card);
      toast.success("Saved to vault — now add your sale photos");
    }
  }
  async function remove(id: string) {
    await supabase.from("vault_cards").delete().eq("id", id);
    load();
  }
  async function updateCondition(card: Card, newCond: Condition) {
    const cp = card.condition_prices || null;
    const base = Number(cp?.NM) || Number(card.estimated_value) || 0;
    const newValue = priceFor(newCond, base, cp);
    // Optimistic UI
    setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, condition: newCond, estimated_value: newValue } : prev));
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, condition: newCond, estimated_value: newValue } : c)));
    const { error } = await supabase.from("vault_cards").update({
      condition: newCond,
      estimated_value: newValue,
    }).eq("id", card.id);
    if (error) { toast.error(error.message); load(); return; }
    toast.success(`Condition: ${newCond} • $${newValue.toFixed(2)}`);
  }

  // Rough market multipliers vs English TCGplayer baseline
  const LANG_MULT: Record<string, number> = {
    en: 1.0, jp: 0.55, kr: 0.45, zh: 0.5, de: 0.7, fr: 0.7, es: 0.65, it: 0.65, pt: 0.6, ru: 0.55,
  };
  function langMult(code?: string | null) {
    const k = String(code || "en").toLowerCase();
    return LANG_MULT[k] ?? 1.0;
  }
  // When the backend already returned a price for the exact language printing
  // (language_matched), the value is correct as-is — do NOT scale it again with
  // the rough multiplier. The multiplier is only a fallback approximation when
  // no real language-specific market record was found.
  function effectiveLangMult(code: string | null | undefined, pricePayload: any) {
    if (pricePayload?.language_matched) return 1.0;
    return langMult(code);
  }

  // Parse "Variant: <Edition> · <Finish>" out of a description
  function parseVariant(desc?: string | null): { edition: Edition; finish: Finish } {
    const m = String(desc || "").match(/Variant:\s*([^\n]+)/i);
    const v = (m?.[1] || "").toLowerCase();
    const ed: Edition = /1st\s*edition|1版|第1版|edition\s*1/i.test(v)
      ? "1st Edition"
      : "Unlimited";
    const isNonHolo = /non[-\s]?holo|non[-\s]?foil|normal/i.test(v);
    const fin: Finish = /reverse/i.test(v)
      ? "Reverse Holo"
      : isNonHolo
        ? "Non-Holo"
        : /\bholo(?:foil)?\b|\bfoil\b/i.test(v)
          ? "Holo"
          : "Non-Holo";
    return { edition: ed, finish: fin };
  }

  function parseLanguage(desc?: string | null): string {
    const m = String(desc || "").match(/Lang:\s*([a-z]{2})/i);
    return (m?.[1] || "en").toLowerCase();
  }

  function setVariantInDescription(
    desc: string | null | undefined,
    ed: Edition,
    fin: Finish,
  ): string {
    const base = String(desc || "")
      .replace(/Variant:\s*[^\n]*\n?/gi, "")
      .trim();
    const label = `Variant: ${ed} · ${fin}`;
    return base ? `${base}\n${label}` : label;
  }

  function setLanguageInDescription(desc: string | null | undefined, code: string): string {
    const base = String(desc || "")
      .replace(/Lang:\s*[a-z]{2}\s*\([^)]*\)\s*\n?/gi, "")
      .trim();
    const label = LANGUAGES.find((l) => l.v === code)?.l || code.toUpperCase();
    const line = `Lang: ${code} (${label})`;
    return base ? `${base}\n${line}` : line;
  }

  async function updateVariant(card: Card, newEd: Edition, newFin: Finish, newLang?: string) {
    const lang = (newLang ?? parseLanguage(card.description)).toLowerCase();
    const mult = langMult(lang);
    const previousVariant = parseVariant(card.description);
    const previousLangMult = langMult(parseLanguage(card.description));
    const currentBaseNm = Number(card.condition_prices?.NM) || Number(card.estimated_value) || 0;
    const previousEditionPremium = editionPremium(previousVariant.edition);
    const previousFinishPremium = finishPremium(previousVariant.finish);
    const nextEditionPremium = editionPremium(newEd);
    const nextFinishPremium = finishPremium(newFin);
    // Re-fetch TCG prices to get exact variant pricing
    const matches = await fetchRealCardMatches({
      name: card.name,
      set: card.tcg_set || undefined,
      number: card.tcg_number || undefined,
      category: card.category || undefined,
    });
    const best = matches[0];
    let cp: ConditionPrices | null = card.condition_prices || null;
    let newValue = currentBaseNm;
    let priced = false;
    if (best?.tcgPrices) {
      const raw = priceFromVariant(best.tcgPrices, newEd, newFin) ?? best.price;
      const variantPrice = raw != null ? Number(raw) * mult : raw;
      const marketCp = conditionPricesFromMarket(variantPrice);
      if (marketCp) {
        cp = marketCp;
        newValue = priceFor(
          (card.condition || "NM") as Condition,
          marketCp.NM || variantPrice || 0,
          marketCp,
        );
        priced = true;
      }
    }
    if (!priced && currentBaseNm > 0) {
      // No exact TCG variant match — rebase from the card's current NM value and apply edition, finish, and language multipliers.
      const englishNonHoloBase =
        currentBaseNm /
        Math.max(0.01, previousLangMult * previousEditionPremium * previousFinishPremium);
      const adj = englishNonHoloBase * nextEditionPremium * nextFinishPremium * mult;
      const recomputed = conditionPricesFromMarket(adj);
      if (recomputed) {
        cp = recomputed;
        newValue = priceFor(
          (card.condition || "NM") as Condition,
          recomputed.NM || adj,
          recomputed,
        );
      }
    }
    let newDesc = setVariantInDescription(card.description, newEd, newFin);
    newDesc = setLanguageInDescription(newDesc, lang);
    // Optimistic UI
    setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, description: newDesc, estimated_value: newValue, condition_prices: cp } : prev));
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, description: newDesc, estimated_value: newValue, condition_prices: cp } : c)));
    const { error } = await supabase.from("vault_cards").update({
      description: newDesc,
      estimated_value: newValue,
      condition_prices: cp as any,
      last_valued_at: new Date().toISOString(),
    }).eq("id", card.id);
    if (error) { toast.error(error.message); load(); return; }
    const langLbl = (LANGUAGES.find((l) => l.v === lang)?.l) || lang.toUpperCase();
    toast.success(`${langLbl} • ${newEd} · ${newFin} • $${Number(newValue).toFixed(2)}`);
  }

  async function updateLanguage(card: Card, code: string) {
    const v = parseVariant(card.description);
    return updateVariant(card, v.edition, v.finish, code);
  }

  async function toggleTradeFlag(card: Card, key: "accept_trades" | "trade_plus_cash" | "accept_offers" | "collection_only", value: boolean) {
    const patch: Partial<Card> = { [key]: value };
    // Collection-only and tradeable are mutually exclusive.
    if (key === "collection_only" && value) { patch.accept_trades = false; patch.trade_plus_cash = false; }
    if ((key === "accept_trades" || key === "trade_plus_cash") && value) patch.collection_only = false;
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
    setActionFor((prev) => (prev && prev.id === card.id ? { ...prev, ...patch } : prev));
    const { error } = await supabase.from("vault_cards").update(patch as never).eq("id", card.id);
    if (error) toast.error("Couldn't update trade setting");
  }



  async function saveEdit() {
    if (!editing) return;
    // estimated_value is auto-managed by TCG; recompute from condition_prices if condition changed
    let newValue = editing.estimated_value;
    if (editing.condition_prices) {
      newValue = priceFor((editing.condition || "NM") as Condition, Number(editing.condition_prices.NM || editing.estimated_value || 0), editing.condition_prices);
    }
    const patch = {
      name: editing.name, category: editing.category, image_url: editing.image_url,
      back_image_url: editing.back_image_url || null,
      description: editing.description,
      price: editing.price != null ? Number(editing.price) : null,
      tcg_number: editing.tcg_number || null, tcg_set: editing.tcg_set || null, tcg_year: editing.tcg_year || null,
      condition: editing.condition || null,
      accept_trades: !!editing.accept_trades,
      trade_plus_cash: !!editing.trade_plus_cash,
      accept_offers: !!editing.accept_offers,
      collection_only: !!editing.collection_only,
      estimated_value: newValue,
    };
    setCards((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...patch } : c)));
    setActionFor((prev) => (prev && prev.id === editing.id ? { ...prev, ...patch } : prev));
    const { error, data } = await supabase.from("vault_cards").update(patch).eq("id", editing.id).select("id").single();
    if (!data && !error) return toast.error("Save did not update this card. Please reopen the vault and try again.");
    if (error) return toast.error(error.message);
    void ensureMasterIdentity(editing.id, {
      category: editing.category, name: editing.name, tcg_set: editing.tcg_set,
      tcg_number: editing.tcg_number, tcg_year: editing.tcg_year, variant: editing.variant,
      language: editing.language || parseLanguage(editing.description), rarity: editing.rarity,
      image_url: editing.image_url, card_identity_id: editing.card_identity_id,
    });
    toast.success("Saved");
    setEditing(null);
    load();
  }

  // Verify the edited card against TCG sources and re-price using the new name/set/number.
  async function verifyWithTcg() {
    if (!editing) return;
    const t = toast.loading("Verifying with TCG…");
    try {
      // Persist user edits first so the verified value sits on top of the right card.
      await supabase.from("vault_cards").update({
        name: editing.name,
        category: editing.category,
        tcg_number: editing.tcg_number || null,
        tcg_set: editing.tcg_set || null,
        tcg_year: editing.tcg_year || null,
        condition: editing.condition || null,
        description: editing.description,
      }).eq("id", editing.id);

      const matches = await fetchRealCardMatches({
        name: editing.name,
        set: editing.tcg_set || undefined,
        number: editing.tcg_number || undefined,
        category: editing.category || undefined,
      });
      const best = matches[0];
      if (!best) {
        toast.error("No TCG match found — check name, set, and card #", { id: t });
        return;
      }
      const v = parseVariant(editing.description);
      const langCode = parseLanguage(editing.description);
      const mult = langMult(langCode);
      const raw = priceFromVariant(best.tcgPrices, v.edition, v.finish) ?? best.price;
      const variantPrice = raw != null ? Number(raw) * mult : raw;
      const cp = conditionPricesFromMarket(variantPrice) || editing.condition_prices || null;
      const newValue = cp
        ? priceFor((editing.condition || "NM") as Condition, Number(cp.NM) || Number(variantPrice) || 0, cp)
        : Number(variantPrice) || editing.estimated_value;
      const patch: any = {
        estimated_value: newValue,
        condition_prices: cp,
        image_url: editing.image_url || best.image || null,
        tcg_set: editing.tcg_set || best.set || null,
        tcg_number: editing.tcg_number || best.number || null,
        tcg_year: editing.tcg_year || best.year || null,
        last_valued_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("vault_cards").update(patch).eq("id", editing.id);
      if (error) { toast.error(error.message, { id: t }); return; }
      void ensureMasterIdentity(editing.id, {
        category: editing.category, name: editing.name, tcg_set: patch.tcg_set,
        tcg_number: patch.tcg_number, tcg_year: patch.tcg_year, variant: editing.variant,
        language: parseLanguage(editing.description), rarity: editing.rarity,
        image_url: patch.image_url, card_identity_id: editing.card_identity_id, confidence_score: 0.9,
      });
      toast.success(`Verified • $${Number(newValue).toFixed(2)}`, { id: t });
      setEditing({ ...editing, ...patch });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Verify failed", { id: t });
    }
  }

  // 🆕 Auto-save the scanned card immediately (with retry) instead of dropping into a form.
  // The scanner already shows a confirm/edit step before calling this.
  async function onScanResult(r: {
    name: string; category: string; trend: string; image: string;
    reference_image?: string;
    set?: string; year?: string; tcg_number?: string; variant?: string; language?: string;
    estimated_value?: number; condition_prices?: ConditionPrices;
    card_identity_id?: string; image_source?: string; match_score?: number;
    confirmed_by?: "auto" | "manual";
    pricing_tier?: "verified" | "estimated" | "unavailable";
    price_range_low?: number; price_range_high?: number;
  }) {
    if (!user) return;
    const cp: ConditionPrices | null = r.condition_prices || null;
    const tier = r.pricing_tier || (r.estimated_value && r.estimated_value > 0 ? "verified" : "unavailable");
    const baseNm = Number(r.estimated_value) > 0 ? Number(r.estimated_value) : (cp?.NM || 1);
    const value = tier === "verified" ? priceFor("NM", baseNm, cp) : 0;
    const lang = r.language || language || "en";

    // Prefer the official/reference card image. Never persist a raw camera
    // frame (data: URL) — the user may have photographed the back of the card.
    // If the scanner only returned OCR, do a quick catalog image lookup instead
    // of generating art, so Pokémon cards show the real card front.
    let finalImage: string | null =
      r.reference_image && !r.reference_image.startsWith("data:") ? r.reference_image : null;
    if (!finalImage && r.image && !r.image.startsWith("data:")) {
      finalImage = r.image;
    }
    if (!finalImage && r.name && r.name !== "Unknown Card") {
      const matches = await fetchRealCardMatches({
        name: r.name,
        set: r.set,
        number: r.tcg_number,
        category: r.category,
      });
      finalImage = matches.find((m) => m.image)?.image || null;
    }
    if (!finalImage && r.name && r.name !== "Unknown Card") {
      try {
        const { data: img } = await supabase.functions.invoke("generate-card-image", {
          body: { name: r.name, category: r.category, set: r.set, year: r.year, tcg_number: r.tcg_number },
        });
        if (img?.image) finalImage = img.image as string;
      } catch {/* ignore — better no image than the wrong one */}
    }

    const payload = {
      user_id: user.id,
      name: r.name,
      category: r.category || "Trading Card",
      image_url: finalImage,
      back_image_url: null,
      description: r.variant && r.variant !== "Standard" ? `Variant: ${r.variant}` : null,
      estimated_value: value,
      condition_prices: tier === "verified" ? (cp as any) : null,
      price: null,
      tcg_number: r.tcg_number || null,
      tcg_set: r.set || null,
      tcg_year: r.year ? String(r.year) : null,
      condition: "NM" as Condition,
      language: lang,
      last_valued_at: new Date().toISOString(),
      card_identity_id: r.card_identity_id || null,
      image_source: r.image_source || null,
      match_score: typeof r.match_score === "number" ? r.match_score : null,
      confirmed_by: r.confirmed_by || null,
      price_tier: tier,
      price_range_low: typeof r.price_range_low === "number" ? r.price_range_low : null,
      price_range_high: typeof r.price_range_high === "number" ? r.price_range_high : null,
    };

    setScanning(false);

    // Retry up to 3 times on transient failure so we never silently drop a scan.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: insScan, error } = await supabase.from("vault_cards").insert(payload).select("id").single();
      if (!error) {
        toast.success(`✅ ${r.name} saved to vault`);
        if (insScan) {
          void ensureMasterIdentity((insScan as { id: string }).id, {
            category: r.category, name: r.name, tcg_set: r.set, tcg_number: r.tcg_number,
            tcg_year: r.year ? String(r.year) : null, variant: r.variant, language: lang,
            image_url: finalImage, card_identity_id: r.card_identity_id, match_score_confidence: undefined,
            confidence_score: typeof r.match_score === "number" ? Math.min(r.match_score / 100, 1) : null,
          } as any);
        }
        load();
        return;
      }
      lastErr = error;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    toast.error(`Couldn't save card — ${lastErr?.message || "try again"}`);
  }

  async function listForSale(card: Card, opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number; reserve?: number; frontImage: string; backImage: string; description?: string; shipping?: number }) {
    const frontErr = validateListingImage(opts.frontImage, { field: "Photo" });
    if (frontErr) return toast.error(frontErr);
    if (!opts.buy_now && !opts.auction && !opts.offer) return toast.error("Pick at least one sale type");
    if (opts.buy_now && opts.price <= 0) return toast.error("Set a Buy Now price");
    if (opts.auction && opts.price <= 0) return toast.error("Set a starting bid");

    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    const primary: "buy_now" | "auction" | "offer" = opts.auction ? "auction" : opts.buy_now ? "buy_now" : "offer";
    const condDesc = card.condition ? ` — Condition: ${card.condition}` : "";
    const baseDesc = (opts.description?.trim() || card.description || `From my vault — ${card.category || "Trading Card"}`) + condDesc;
    const { data, error } = await supabase.from("listings").insert({
      seller_id: user!.id, title: card.name,
      description: baseDesc,
      image_url: opts.frontImage,
      back_image_url: opts.backImage || null,

      category: card.category || null,
      listing_type: primary,
      is_auction: opts.auction,
      accepts_offers: opts.offer,
      price: opts.buy_now ? opts.price : null,
      buy_now_price: opts.buy_now ? opts.price : null,
      starting_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      current_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      reserve_price: opts.auction && opts.reserve ? opts.reserve : null,
      shipping_price: opts.shipping ?? 0,
      auction_ends_at: opts.auction ? new Date(Date.now() + opts.days * 24 * 60 * 60 * 1000).toISOString() : null,
      condition: card.condition || null,
      tcg_number: card.tcg_number || null,
      tcg_set: card.tcg_set || null,
      tcg_year: card.tcg_year || null,
      vault_card_id: card.id,
    }).select().single();
    if (error) {
      const msg = /duplicate|unique/i.test(error.message)
        ? "This vault card already has an active listing. Edit or remove the existing listing first."
        : /image|url/i.test(error.message)
          ? "Photo upload didn't save. Please re-upload your sale photos and try again."
          : error.message;
      return toast.error(msg);
    }
    toast.success("Listed!");
    setSelling(null);
    nav({ to: "/market/$id", params: { id: data.id } });
  }

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Your Vault</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to save your cards.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">My Vault</h1>
            <p className="text-xs text-muted-foreground">{cards.length} card{cards.length !== 1 ? "s" : ""} · scan, value, list</p>
          </div>
          <div className="flex gap-2">
            <button onClick={async () => { await enrichPrices(cards, true); await backfillMissingImages(cards, true); }} disabled={enriching} className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5 text-xs font-bold ring-1 ring-border/60 transition hover:bg-card active:scale-[0.98] disabled:opacity-50"><DollarSign className="h-3.5 w-3.5" /> {enriching ? "Refreshing…" : "Rescan all"}</button>

            <button onClick={() => setScanning(true)} className="inline-flex items-center gap-1.5 rounded-full bg-card/60 px-3 py-1.5 text-xs font-bold ring-1 ring-border/60 transition hover:bg-card active:scale-[0.98]"><Camera className="h-3.5 w-3.5" /> Scan</button>
            <button onClick={() => { resetForm(); setShowAdd(true); }} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-[var(--shadow-primary)] transition active:scale-[0.98]"><Plus className="h-3.5 w-3.5" /> Add card</button>
          </div>
        </div>
        <div className="mb-3"><WatchTutorial routePath="/vault" label="How vaults work" /></div>
        {/* Totals (owner only) */}
        <div className="mb-3 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/25 via-accent/15 to-card p-5 shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Vault Value</p>
              <p className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">${totalValue.toFixed(2)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{cards.length} card{cards.length !== 1 ? "s" : ""}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Purchase Cost</p>
              <p className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">${totalPurchase.toFixed(2)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">what you paid</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit / Loss</p>
              <p className={`mt-1 text-2xl font-bold tracking-tight sm:text-4xl ${totalProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {totalProfit >= 0 ? "+" : "-"}${Math.abs(totalProfit).toFixed(2)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">vs. market value</p>
            </div>
          </div>
        </div>

        {/* Vault growth over time (owner only) */}
        {user?.id && <VaultGrowthChart userId={user.id} liveValue={totalValue} />}



        {/* Pricing diagnostics — makes missing-value issues easy to spot */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: "Total Cards", v: pricingDiagnostics.total, cls: "text-foreground" },
            { l: "Priced", v: pricingDiagnostics.withValue, cls: "text-emerald-500" },
            { l: "Missing Values", v: pricingDiagnostics.missing, cls: pricingDiagnostics.missing > 0 ? "text-amber-500" : "text-muted-foreground" },
            { l: "Awaiting Sync", v: pricingDiagnostics.awaiting, cls: pricingDiagnostics.awaiting > 0 ? "text-sky-400" : "text-muted-foreground" },
          ].map((d) => (
            <div key={d.l} className="rounded-xl border border-border/60 bg-card p-3 text-center shadow-[var(--shadow-card)]">
              <p className={`text-xl font-bold ${d.cls}`}>{d.v}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.l}</p>
            </div>
          ))}
        </div>


        {/* Review Queue removed — unsure cards are fixed inline via a simple
            "Choose Correct Card" popup, and confident scans save automatically. */}



        {/* Vault sharing (one setting for the whole vault) */}
        <div className="mb-4 rounded-xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold">Who can see your vault</p>
            {savingVis && <span className="text-[10px] text-muted-foreground">Saving…</span>}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {([
              { v: "private",   l: "Only me",   I: Lock },
              { v: "friends",   l: "Friends",   I: UserCheck },
              { v: "followers", l: "Followers", I: Users },
              { v: "public",    l: "Public",    I: Globe },
            ] as const).map(({ v, l, I }) => (
              <button key={v} type="button" onClick={() => updateVaultVisibility(v)}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold transition ${vaultVisibility === v ? "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]" : "bg-card/60 text-muted-foreground ring-1 ring-border/60 hover:bg-card hover:text-foreground"}`}>
                <I className="h-3.5 w-3.5" />
                {l}
              </button>
            ))}
          </div>
          {vaultVisibility !== "private" && profile?.username && (
            <p className="mt-2 break-all text-[10px] text-muted-foreground">
              Share link: <span className="font-mono">/u/{profile.username}/vault</span>
            </p>
          )}
        </div>


        {showAdd && (
          <div className="mb-4 space-y-2 rounded-xl bg-card p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground">Front photo</p>
                {imageUrl && <img src={imageUrl} className="mt-1 h-24 w-full rounded-lg object-cover" alt="" />}
                <input type="file" accept="image/*" onChange={(e) => handleFile(e, setImageUrl)} className="mt-1 block w-full text-[10px]" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Back photo</p>
                {backImageUrl && <img src={backImageUrl} className="mt-1 h-24 w-full rounded-lg object-cover" alt="" />}
                <input type="file" accept="image/*" onChange={(e) => handleFile(e, setBackImageUrl)} className="mt-1 block w-full text-[10px]" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Front photo required to add. Back photo required to sell.</p>
            <div>
              <p className="mb-1 text-[10px] text-muted-foreground">Card language (helps pull the right printing)</p>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg bg-input px-3 py-2 text-sm"
              >
                {LANGUAGES.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
              </select>
            </div>
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card name (English, 日本語, 한국어, 中文…)" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card #" value={tcgNumber} onChange={(e) => setTcgNumber(e.target.value)} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Set" value={tcgSet} onChange={(e) => setTcgSet(e.target.value)} />
              <input className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Year" value={tcgYear} onChange={(e) => setTcgYear(e.target.value)} />
            </div>
            <button type="button" onClick={identifyNow} disabled={identifying} className="w-full rounded-lg bg-gradient-to-r from-primary to-accent py-2.5 text-sm font-bold text-primary-foreground shadow-md disabled:opacity-60">
              {identifying ? "Verifying with TCG…" : "🔍 Verify & price with TCG"}
            </button>
            <p className="-mt-1 text-[10px] text-muted-foreground">Works in any language — auto-translates to find the correct printing.</p>
            {alternatives.length > 0 && (
              <div className="rounded-lg bg-muted/40 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Similar printings · tap to swap</p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => cycleAlternative(-1)} className="rounded-md bg-muted px-2 py-0.5 text-[10px]">‹ Prev</button>
                    <button type="button" onClick={() => cycleAlternative(1)} className="rounded-md bg-muted px-2 py-0.5 text-[10px]">Next ›</button>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {alternatives.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => applyAlternative(a)}
                      className={`shrink-0 overflow-hidden rounded-md ring-2 ${i === altIndex ? "ring-primary" : "ring-transparent"}`}
                      title={`${a.name}${a.set ? ` · ${a.set}` : ""}${a.number ? ` · #${a.number}` : ""}`}
                    >
                      {a.image ? (
                        <img src={a.image} alt={a.name} className="h-24 w-16 object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-24 w-16 items-center justify-center bg-muted text-[9px] text-muted-foreground">No img</div>
                      )}
                      {a.price ? <p className="bg-black/60 px-1 text-center text-[9px] text-white">${a.price.toFixed(2)}</p> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category (Pokémon, MTG, ...)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">Edition</p>
                <select value={edition} onChange={(e) => setEdition(e.target.value as Edition)} className="w-full rounded-lg bg-input px-3 py-2 text-sm">
                  <option value="Unlimited">Unlimited</option>
                  <option value="1st Edition">1st Edition</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground">Finish</p>
                <select value={finish} onChange={(e) => setFinish(e.target.value as Finish)} className="w-full rounded-lg bg-input px-3 py-2 text-sm">
                  <option value="Non-Holo">Non-Holo</option>
                  <option value="Holo">Holo</option>
                  <option value="Reverse Holo">Reverse Holo</option>
                </select>
              </div>
            </div>
            <p className="-mt-1 text-[10px] text-muted-foreground">Price auto-updates from TCG market for the selected edition & finish.</p>
            <div>
              <p className="text-[10px] text-muted-foreground">Condition</p>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCondition(c)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-bold ${condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                ))}
              </div>
            </div>
            <textarea rows={2} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <p className="text-[9px] uppercase text-muted-foreground">Value (auto)</p>
                <p className="font-bold">{estValue ? `$${Number(estValue).toFixed(2)}` : "—"}</p>
              </div>
              <input type="number" min="0" step="0.01" className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="My ask price ($)" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <p className="text-[10px] text-muted-foreground">Value is set automatically from TCG market data — it can't be edited.</p>
            <label className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold ring-1 ring-primary/30">
              <input type="checkbox" checked={sellAfterSave} onChange={(e) => setSellAfterSave(e.target.checked)} className="h-4 w-4" />
              <Tag className="h-3.5 w-3.5 text-primary" />
              Sell this item right after saving
            </label>
            <div className="flex gap-2">
              <button onClick={add} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">{sellAfterSave ? "Save & List" : "Save"}</button>
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="rounded-lg bg-muted px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Search + view mode */}
        {cards.length > 0 && (
          <div className="relative mb-3 flex items-stretch gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-input px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                placeholder="Search by name, set, year, or card #"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search"><X className="h-4 w-4 text-muted-foreground" /></button>
              )}
              <button
                onClick={listening ? stopVoice : startVoice}
                aria-label={listening ? "Stop voice" : "Voice search"}
                className={`rounded-full p-1 ${listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted text-muted-foreground"}`}
              >
                {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
            </div>
            {/* View mode dropdown */}
            <div className="relative">
              <button
                onClick={() => setViewMenu((v) => !v)}
                aria-label="Change view"
                className="flex h-full items-center gap-1 rounded-xl bg-input px-3 text-xs font-semibold text-foreground"
              >
                {viewMode === "small" && <Grid3x3 className="h-4 w-4" />}
                {viewMode === "grid" && <LayoutGrid className="h-4 w-4" />}
                {viewMode === "large" && <Rows className="h-4 w-4" />}
                {viewMode === "list" && <List className="h-4 w-4" />}
              </button>
              {viewMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setViewMenu(false)} />
                  <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                    {([
                      { id: "small", label: "Small", icon: Grid3x3 },
                      { id: "grid", label: "Grid", icon: LayoutGrid },
                      { id: "large", label: "Large", icon: Rows },
                      { id: "list", label: "List", icon: List },
                    ] as const).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => { setViewMode(id); setViewMenu(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted ${viewMode === id ? "bg-muted font-bold" : ""}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {cards.length > 0 && showSuggest && suggestions.length > 0 && (
          <div className="relative -mt-2 mb-3">
            <div className="absolute left-0 right-0 top-0 z-10 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {suggestions.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); setQuery(s); setShowSuggest(false); }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Search className="mr-2 inline h-3 w-3 text-muted-foreground" />{s}
                  </button>
                ))}
            </div>
          </div>
        )}

        {cards.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Your vault is empty</p>}
        {cards.length > 0 && filteredCards.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No cards match "{query}"</p>
        )}
        <div className={
          viewMode === "small" ? "grid grid-cols-4 gap-2" :
          viewMode === "grid" ? "grid grid-cols-2 gap-3" :
          viewMode === "large" ? "grid grid-cols-1 gap-3" :
          "flex flex-col gap-2"
        }>
          {filteredCards.map((c) => {
            const meta = [c.tcg_set, c.tcg_year, c.tcg_number && `#${c.tcg_number}`].filter(Boolean).join(" • ");
            const cv = parseVariant(c.description);
            if (viewMode === "list") {
              return (
                <button key={c.id} onClick={() => setActionFor(c)} className="flex items-center gap-3 overflow-hidden rounded-xl bg-card p-2 text-left active:scale-[0.99]">
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                    {displayImage(c) ? <img src={displayImage(c)} loading="lazy" decoding="async" className="h-full w-full object-cover" alt={c.name} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
                  </div>
                  <span title={`${confidenceTier(c.confidence_score).label} confidence`} className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${confidenceTier(c.confidence_score).dot}`} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold">{c.name}</p>
                    {meta && <p className="line-clamp-1 text-[10px] text-muted-foreground">{meta}</p>}
                    <p className="line-clamp-1 text-[10px] text-muted-foreground">{c.category || "—"}{c.condition && ` • ${c.condition}`} • {cv.edition}</p>
                  </div>
                  {c.needs_review && !isUserVerified(c) && <span onClick={(e) => { e.stopPropagation(); openMatchPicker(c); }} className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white active:scale-95"><ImageIcon className="h-3 w-3" /> Fix</span>}
                  {Number(c.estimated_value || 0) > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold text-primary">${Number(c.estimated_value).toFixed(2)}</p>
                      {cardGain(c) != null && (
                        <p className={`text-[10px] font-semibold ${cardGain(c)! >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                          {cardGain(c)! >= 0 ? "+" : "-"}${Math.abs(cardGain(c)!).toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                </button>
              );
            }
            return (
              <button key={c.id} onClick={() => setActionFor(c)} className="overflow-hidden rounded-xl bg-card text-left active:scale-[0.98]">
                <div className="relative aspect-square bg-muted">
                  {displayImage(c) ? <img src={displayImage(c)} loading="lazy" decoding="async" className="h-full w-full object-cover" alt={c.name} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
                  <span title={`${confidenceTier(c.confidence_score).label} confidence`} className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-black/40 ${confidenceTier(c.confidence_score).dot}`} />
                  {cv.edition === "1st Edition" ? (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md border border-yellow-300/80 bg-black/85 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-yellow-300 shadow-lg">
                      1st Edition
                    </span>
                  ) : (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md border border-white/30 bg-black/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white/90 shadow-lg">
                      Unlimited
                    </span>
                  )}
                  {viewMode === "small" && c.needs_review && !isUserVerified(c) && (
                    <span onClick={(e) => { e.stopPropagation(); openMatchPicker(c); }} className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded-md bg-amber-500/95 px-1.5 py-1 text-[9px] font-bold text-white active:scale-95">
                      <ImageIcon className="h-3 w-3" /> Fix card
                    </span>
                  )}
                </div>
                {viewMode !== "small" && (
                  <div className="p-2">
                    <p className="line-clamp-1 text-sm font-semibold">{c.name}</p>
                    {meta && <p className="line-clamp-1 text-[10px] text-muted-foreground">{meta}</p>}
                    <p className="text-[10px] text-muted-foreground">
                      {c.category || "—"}{c.condition && ` • ${c.condition}`}
                    </p>
                    {c.needs_review && !isUserVerified(c) && <span onClick={(e) => { e.stopPropagation(); openMatchPicker(c); }} className="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-white active:scale-95"><ImageIcon className="h-3 w-3" /> Choose Correct Card</span>}
                    {Number(c.estimated_value || 0) > 0 && (
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <p className="text-sm font-bold text-primary">${Number(c.estimated_value).toFixed(2)}</p>
                        {cardGain(c) != null && (
                          <span className={`text-[10px] font-semibold ${cardGain(c)! >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {cardGain(c)! >= 0 ? "+" : "-"}${Math.abs(cardGain(c)!).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {viewMode === "small" && Number(c.estimated_value || 0) > 0 && (
                  <p className="px-1 py-1 text-center text-[10px] font-bold text-primary">${Number(c.estimated_value).toFixed(2)}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Card expanded view */}
      {actionFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4" onClick={() => setActionFor(null)}>
          <div className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <button onClick={() => setActionFor(null)} aria-label="Back" className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/80">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="flex-1 px-2">
                <p className="text-lg font-bold leading-tight">{actionFor.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {[actionFor.category, actionFor.tcg_set, actionFor.tcg_year, actionFor.tcg_number && `#${actionFor.tcg_number}`].filter(Boolean).join(" • ") || "—"}
                </p>
              </div>
              <button onClick={() => setActionFor(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>

            {/* Price verification + confidence badges (advanced only) */}
            {advanced && (
              <div className="flex flex-wrap items-center gap-2">
                {(() => { const b = priceBadge(actionFor); return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${b.cls}`}><ShieldCheck className="h-3 w-3" /> {b.label}</span>; })()}
                {(() => { const t = confidenceTier(actionFor.confidence_score); return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${t.chip}`}><span className={`h-2 w-2 rounded-full ${t.dot}`} /> {t.label} {t.pct}%</span>; })()}
              </div>
            )}

            {/* Low-confidence price warning — shown whenever a value is assigned
                but the card is not safely/user-verified, so collectors never
                silently trust a possibly-wrong number. */}
            {Number(actionFor.estimated_value || 0) > 0 &&
              !isSafePriced(actionFor) &&
              !isUserVerified(actionFor) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>⚠ Price may be inaccurate. Please verify with TCGPlayer.</span>
                </div>
              )}



            <div className="grid grid-cols-2 gap-2">
              <div>
                {(() => {
                  const opts = imageOptions(actionFor);
                  const sel = opts.find((o) => o.key === imgKey) || opts[0];
                  const url = sel?.url || displayImage(actionFor);
                  return (
                    <>
                      <div className="mb-1 flex flex-wrap gap-1">
                        {opts.length > 1 ? opts.map((o) => (
                          <button key={o.key} type="button" onClick={() => setImgKey(o.key)}
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${ (sel?.key === o.key) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {o.label}
                          </button>
                        )) : <p className="text-[10px] uppercase text-muted-foreground">Front</p>}
                      </div>
                      <div className="relative">
                        {url
                          ? <img src={url} className="aspect-[3/4] w-full rounded-lg object-cover" alt={actionFor.name} />
                          : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">No photo</div>}
                        {parseVariant(actionFor.description).edition === "1st Edition" ? (
                          <span className="absolute bottom-2 left-2 rounded-md border border-yellow-300/80 bg-black/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300 shadow-lg">1st Edition</span>
                        ) : (
                          <span className="absolute bottom-2 left-2 rounded-md border border-white/30 bg-black/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/90 shadow-lg">Unlimited</span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Back</p>
                {actionFor.back_image_url
                  ? <img src={actionFor.back_image_url} className="aspect-[3/4] w-full rounded-lg object-cover" alt="" />
                  : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-muted text-center text-[10px] text-muted-foreground">No back photo<br/>(needed to sell)</div>}
              </div>
            </div>


            {actionFor.needs_review && !isUserVerified(actionFor) && (
              <div className="space-y-2 rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/25">
                <div className="flex items-start gap-2 text-amber-500">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm font-bold">Is this your card?</p>
                </div>
                <p className="text-xs text-muted-foreground">Tap below and pick the correct card — we'll fill in the details and value automatically.</p>
                <button onClick={() => openMatchPicker(actionFor)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-white active:scale-[0.99]">
                  <ImageIcon className="h-4 w-4" /> Choose Correct Card
                </button>
              </div>
            )}

            {/* Value + condition (consumer-friendly, always visible) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted/40 p-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[9px] uppercase text-muted-foreground">Market value</p>
                  <button
                    type="button"
                    onClick={() => retryPricing(actionFor)}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/80"
                  >
                    <RefreshCw className="h-2.5 w-2.5" /> Refresh
                  </button>
                </div>
                {isSafePriced(actionFor) || (isUserVerified(actionFor) && Number(actionFor.estimated_value || 0) > 0) ? (
                  <p className="text-base font-bold text-primary">${Number(actionFor.estimated_value).toFixed(2)}</p>
                ) : isUserVerified(actionFor) ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-amber-500">Market value unavailable</p>
                    <button
                      type="button"
                      onClick={() => retryPricing(actionFor)}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground active:scale-95"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry pricing
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openMatchPicker(actionFor)}
                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-[11px] font-bold text-white active:scale-95"
                  >
                    <ImageIcon className="h-3 w-3" /> Choose Correct Card
                  </button>
                )}
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[9px] uppercase text-muted-foreground">Condition (tap to update)</p>
                <div className="mt-1 grid grid-cols-4 gap-1">
                  {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateCondition(actionFor, c)}
                      className={`rounded-md px-1.5 py-1 text-[11px] font-bold ${actionFor.condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Purchase Information — private to the owner only */}
            <PurchaseInfoPanel
              cardId={actionFor.id}
              marketValue={isSafePriced(actionFor) ? Number(actionFor.estimated_value || 0) : 0}
              initial={{
                purchase_price: actionFor.purchase_price,
                purchase_date: actionFor.purchase_date,
                purchased_from: actionFor.purchased_from,
              }}
              onSaved={(patch) => {
                setCards((prev) => prev.map((c) => c.id === actionFor!.id ? { ...c, ...(patch as any) } : c));
                setActionFor((prev) => prev ? { ...prev, ...(patch as any) } : prev);
              }}
            />

            {/* Advanced Details toggle */}
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/60"
            >
              <span>Advanced details</span>
              {advanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {advanced && (<>
            {/* Structured card identity — every required field */}
            {(() => {
              const fields: [string, string | null | undefined][] = [
                ["Card Name", actionFor.name],
                ["Category / Game", actionFor.category],
                ["Set Name", actionFor.tcg_set],
                ["Card Number", actionFor.tcg_number],
                ["Year", actionFor.tcg_year],
                ["Rarity", actionFor.rarity],
                ["Variant", actionFor.variant],
                ["Language", (actionFor.language || parseLanguage(actionFor.description) || "").toUpperCase()],
                ["Condition", actionFor.condition],
                ["Grading Co.", actionFor.is_graded ? actionFor.grader : "—"],
                ["Grade", actionFor.is_graded ? actionFor.grade : "—"],
                ["Price Source", actionFor.price_source || (actionFor.price_is_ai ? "AI estimate" : "—")],
                ["Last Updated", actionFor.price_updated_at ? new Date(actionFor.price_updated_at).toLocaleString() : "—"],
                ["Confidence", actionFor.confidence_score != null ? `${Math.round(Number(actionFor.confidence_score) * 100)}%` : "—"],
              ];
              return (
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Card Details</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    {fields.map(([label, value]) => {
                      const missing = !value || value === "—";
                      return (
                        <div key={label} className="flex flex-col">
                          <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
                          <span className={missing ? "font-medium text-amber-500" : "font-semibold text-foreground"}>
                            {missing ? "Missing" : value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
            )})()}

            {/* Market Source */}
            {(() => {
              const ms = (actionFor.pricing_details as any)?.market_source || null;
              const suspicious = !!(actionFor.pricing_details as any)?.suspicious;
              const tcgId = ms?.tcgplayer_product_id || null;
              const pcId = ms?.pricecharting_product_id || null;
              const lastSync = ms?.last_sync || actionFor.price_updated_at || null;
              const Row = ({ ok, label }: { ok: boolean; label: string }) => (
                <div className="flex items-center gap-1.5">
                  {ok ? <ShieldCheck className="h-3 w-3 text-emerald-500" /> : <X className="h-3 w-3 text-muted-foreground" />}
                  <span className={ok ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
                </div>
              );
              return (
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"><DollarSign className="h-3 w-3" /> Market Source</p>
                  {suspicious && (
                    <div className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 p-1.5 text-[10px] text-amber-600">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>{(actionFor.review_reason) || "Value flagged as suspicious — re-sync recommended."}</span>
                    </div>
                  )}
                  <div className="grid gap-1 text-[11px]">
                    <Row ok={!!tcgId} label={tcgId ? `TCGPlayer ID: ${tcgId}` : "TCGPlayer ID: —"} />
                    <Row ok={!!pcId} label={pcId ? `PriceCharting ID: ${pcId}` : "PriceCharting ID: —"} />
                    <div className="flex items-center gap-1.5">
                      <History className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Last Sync: {lastSync ? new Date(lastSync).toLocaleString() : "—"}</span>
                    </div>
                    {ms?.variant_used && (
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Variant: {ms.variant_used}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => retryPricing(actionFor)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground transition active:scale-[0.98]"
                  >
                    <RefreshCw className="h-3 w-3" /> Refresh Market Data
                  </button>
                </div>
              );
            })()}



            {/* Audit trail */}
            {(() => {
              const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");
              const rows: [string, string][] = [
                ["Date Added", fmt(actionFor.created_at)],
                ["Last Identified", fmt(actionFor.last_rescan_at)],
                ["Last Repriced", fmt(actionFor.price_updated_at)],
                ["Price Source", actionFor.price_source || (actionFor.price_is_ai ? "AI estimate" : "—")],
                ["Last Price Refresh", fmt(actionFor.price_updated_at)],
                ["Confidence Score", actionFor.confidence_score != null ? `${Math.round(Number(actionFor.confidence_score) * 100)}%` : "—"],
              ];
              return (
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"><History className="h-3 w-3" /> Audit Trail</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    {rows.map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Match history */}
            {Array.isArray(actionFor.match_history) && actionFor.match_history.length > 0 && (
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Match History</p>
                <div className="space-y-1.5">
                  {[...actionFor.match_history].reverse().map((h, i) => (
                    <div key={i} className="text-[11px]">
                      <p className="font-semibold text-foreground">{h.from || "Unknown"} → {h.to || "Unknown"}</p>
                      <p className="text-[9px] text-muted-foreground">Corrected by {h.by || "AI"} · {h.at ? new Date(h.at).toLocaleString() : "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}



            {/* Language, Edition & Finish (auto-repricing) */}
            {(() => {
              const v = parseVariant(actionFor.description);
              const lang = parseLanguage(actionFor.description);
              return (
                <div className="space-y-2">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[9px] uppercase text-muted-foreground">Language (repriced automatically)</p>
                    <select
                      value={lang}
                      onChange={(e) => updateLanguage(actionFor, e.target.value)}
                      className="mt-1 w-full rounded-md bg-input px-2 py-1 text-xs"
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l.v} value={l.v}>{l.l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[9px] uppercase text-muted-foreground">Edition</p>
                      <select
                        value={v.edition}
                        onChange={(e) => updateVariant(actionFor, e.target.value as Edition, v.finish)}
                        className="mt-1 w-full rounded-md bg-input px-2 py-1 text-xs"
                      >
                        <option value="Unlimited">Unlimited</option>
                        <option value="1st Edition">1st Edition</option>
                      </select>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2">
                      <p className="text-[9px] uppercase text-muted-foreground">Finish</p>
                      <select
                        value={v.finish}
                        onChange={(e) => updateVariant(actionFor, v.edition, e.target.value as Finish)}
                        className="mt-1 w-full rounded-md bg-input px-2 py-1 text-xs"
                      >
                        <option value="Non-Holo">Non-Holo</option>
                        <option value="Holo">Holo</option>
                        <option value="Reverse Holo">Reverse Holo</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* (Manual Value Override removed — replaced by Purchase Information above) */}

            {/* Graded card pricing */}
            <GradedCardPanel
              cardId={actionFor.id}
              rawMarketPrice={actionFor.market_price ?? actionFor.condition_prices?.NM ?? actionFor.estimated_value}
              initial={{
                is_graded: actionFor.is_graded,
                grader: actionFor.grader,
                grade: actionFor.grade,
                grading_cert: actionFor.grading_cert,
                graded_price: actionFor.graded_price,
              }}
              onSaved={(patch) => {
                setCards((prev) => prev.map((c) => c.id === actionFor!.id ? { ...c, ...(patch as any) } : c));
                setActionFor((prev) => prev ? { ...prev, ...(patch as any) } : prev);
              }}
            />

            <button onClick={() => reportIncorrectPrice(actionFor)} disabled={!!actionFor.incorrect_price_reported} className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted py-2.5 text-sm font-bold text-muted-foreground disabled:opacity-60">
              <Flag className="h-4 w-4" /> {actionFor.incorrect_price_reported ? "Price reported" : "Report incorrect price"}
            </button>
            </>)}

            {actionFor.description && (
              <div className="rounded-lg bg-muted/40 p-2 text-xs">
                <p className="text-[9px] uppercase text-muted-foreground">Description</p>
                <p className="mt-0.5 whitespace-pre-wrap">{actionFor.description}</p>
              </div>
            )}

            <CardPriceChart name={actionFor.name} tcgSet={actionFor.tcg_set} tcgNumber={actionFor.tcg_number} currentValue={actionFor.estimated_value} cardIdentityId={actionFor.card_identity_id} />

            <div className="rounded-lg bg-muted/40 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Trade availability</p>
              {([
                ["accept_trades", "Available for trade"],
                ["trade_plus_cash", "Accept trade + cash"],
                ["accept_offers", "Accept offers"],
                ["collection_only", "Collection only (not for trade)"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={!!actionFor[key]}
                    onChange={(e) => toggleTradeFlag(actionFor, key, e.target.checked)}
                    className="h-5 w-5 accent-primary"
                  />
                </label>
              ))}
            </div>




            <button onClick={() => { setSelling(actionFor); setActionFor(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground">
              <Tag className="h-4 w-4" /> Sell this card
            </button>
            <button onClick={() => { openMatchPicker(actionFor); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/15 py-2.5 text-sm font-bold text-amber-500">
              <ImageIcon className="h-4 w-4" /> Wrong card? Choose the correct one
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditing(actionFor)} className="flex items-center justify-center gap-2 rounded-lg bg-muted py-2.5 text-sm">
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <button onClick={() => { remove(actionFor.id); setActionFor(null); }} className="flex items-center justify-center gap-2 rounded-lg bg-destructive/20 py-2.5 text-sm text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual card matcher — tap the correct card image, or enter manually */}
      {matchingCard && (
        <CardMatchPicker
          uploadedImage={matchingCard.original_image_url || matchingCard.image_url || undefined}
          card={{ name: matchingCard.name, tcg_set: matchingCard.tcg_set, tcg_number: matchingCard.tcg_number, category: matchingCard.category }}
          fetchMatches={(opts) => fetchRealCardMatches(opts) as Promise<MatchOption[]>}
          onSelect={(m) => applyMatch(matchingCard, m)}
          onManualSave={(f) => applyManual(matchingCard, f)}
          onClose={() => setMatchingCard(null)}
        />
      )}


      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/70 p-4" onClick={() => setEditing(null)}>
          <div className="my-4 max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-2 overflow-y-auto rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold">Edit card</p>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            {editing.image_url && <img src={editing.image_url} className="mx-auto h-32 rounded-lg object-cover" alt="" />}
            {/* Re-open the visual matcher for ANY saved card — even verified ones —
                so the user can fix a wrong image / set / rarity / variant / price. */}
            <button
              onClick={() => { const c = editing; setEditing(null); openMatchPicker(c); }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary/15 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/25"
            >
              <ImageIcon className="h-4 w-4" /> Find correct card / change match
            </button>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">Change image</span>
              <input type="file" accept="image/*" onChange={(e) => handleFile(e, (v) => setEditing({ ...editing, image_url: v }))} className="block w-full text-xs" />
            </label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="TCG card name" />
            <div className="grid grid-cols-2 gap-2">
              <input value={editing.tcg_number || ""} onChange={(e) => setEditing({ ...editing, tcg_number: e.target.value })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Card #" />
              <input value={editing.tcg_set || ""} onChange={(e) => setEditing({ ...editing, tcg_set: e.target.value })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="Set" />
            </div>
            <input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full rounded-lg bg-input px-3 py-2 text-sm" placeholder="Category" />
            <div>
              <p className="text-[10px] text-muted-foreground">Condition</p>
              <div className="mt-1 grid grid-cols-4 gap-1">
                {(["NM", "LP", "MP", "Damaged"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setEditing({ ...editing, condition: c })}
                    className={`rounded-lg px-2 py-1.5 text-xs font-bold ${editing.condition === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</button>
                ))}
              </div>
            </div>
            <textarea rows={2} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full resize-none rounded-lg bg-input px-3 py-2 text-sm" placeholder="Description" />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                <p className="text-[9px] uppercase text-muted-foreground">Value (auto, TCG)</p>
                <p className="font-bold">${Number(editing.estimated_value || 0).toFixed(2)}</p>
              </div>
              <input type="number" min="0" step="0.01" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })} className="rounded-lg bg-input px-3 py-2 text-sm" placeholder="My ask price ($)" />
            </div>
            <div className="rounded-lg bg-muted/40 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Trade availability</p>
              {([
                ["accept_trades", "Available for trade"],
                ["trade_plus_cash", "Accept trade + cash"],
                ["accept_offers", "Accept offers"],
                ["collection_only", "Collection only (not for trade)"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={!!editing[key]}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.checked })}
                    className="h-5 w-5 accent-primary"
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={saveEdit} className="rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save changes</button>
              <button onClick={verifyWithTcg} className="rounded-lg bg-emerald-500/20 py-2 text-sm font-bold text-emerald-400 hover:bg-emerald-500/30">Verify with TCG</button>
            </div>
          </div>
        </div>
      )}

      {/* Sell modal */}
      {selling && <SellModal card={selling} onClose={() => setSelling(null)} onSubmit={(opts) => listForSale(selling, opts)} />}

      {scanning && (
        <Suspense fallback={null}>
          <CardScanner
            onResult={onScanResult}
            onResults={async (rs) => { for (const r of rs) await onScanResult(r as any); }}
            onClose={() => setScanning(false)}
            onAction={(action, r) => {
              if (action === "inventory" || action === "draft") {
                onScanResult(r as any);
                return;
              }
              // Stash for the Sell page to pick up and auto-fill
              try {
                sessionStorage.setItem("pbl_prefill_listing", JSON.stringify({
                  ...r,
                  listing_type: action === "auction" ? "auction" : action === "offer" ? "offer" : "buy_now",
                }));
              } catch {}
              setScanning(false);
              nav({ to: "/sell" });
            }}
          />
        </Suspense>
      )}
    </AppShell>
  );
}

function SellModal({ card, onClose, onSubmit }: {
  card: Card;
  onClose: () => void;
  onSubmit: (opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number; reserve?: number; frontImage: string; backImage: string; description?: string; shipping?: number }) => void;
}) {
  const [saleType, setSaleType] = useState<"buy_now" | "auction" | "offer">("buy_now");
  const [days, setDays] = useState(3);
  const [price, setPrice] = useState(String(card.price ?? card.estimated_value ?? 1));
  const [reserve, setReserve] = useState("");
  const [shipping, setShipping] = useState("0");
  const [frontImage, setFrontImage] = useState<string>(
    !card.image_url || card.image_url.startsWith("data:") ? "" : card.image_url,
  );
  const [backImage, setBackImage] = useState<string>(
    !card.back_image_url || card.back_image_url.startsWith("data:") ? "" : (card.back_image_url || ""),
  );
  const [desc, setDesc] = useState<string>(card.description || "");

  const buyNow = saleType === "buy_now";
  const auction = saleType === "auction";
  const offer = saleType === "offer";

  const meta = [
    card.tcg_set, card.tcg_number ? `#${card.tcg_number}` : null,
    card.tcg_year, card.condition,
    card.is_graded && card.grader ? `${card.grader} ${card.grade ?? ""}`.trim() : null,
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-card p-4 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold">List "{card.name}"</p>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {meta.length > 0 && (
          <div className="flex flex-wrap gap-1 text-[11px]">
            {meta.map((m) => (
              <span key={m} className="rounded-full bg-muted/50 px-2 py-0.5">{m}</span>
            ))}
          </div>
        )}

        <ListingImageUpload value={frontImage} onChange={setFrontImage} label="Photo (front)" />
        <ListingImageUpload value={backImage} onChange={setBackImage} label="Back photo (optional)" />

        <div>
          <p className="mb-1 text-[10px] uppercase text-muted-foreground">Marketplace listing type</p>
          <div className="grid grid-cols-3 gap-1">
            {(["buy_now", "auction", "offer"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSaleType(t)}
                className={`rounded-lg px-2 py-2 text-xs font-bold ${saleType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {t === "buy_now" ? "Buy Now" : t === "auction" ? "Timed Auction" : "Offer"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Lists on the marketplace. To sell live on stream, start a Live show instead.
          </p>
        </div>


        {!offer && (
          <div>
            <p className="mb-1 text-[10px] uppercase text-muted-foreground">{auction ? "Starting bid" : "Price"}</p>
            <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" />
            </div>
          </div>
        )}

        {auction && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Length</p>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-lg bg-input px-2 py-2 text-sm">
                {[1, 3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d}d</option>)}
              </select>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase text-muted-foreground">Reserve</p>
              <input type="number" min="0" step="0.01" value={reserve} onChange={(e) => setReserve(e.target.value)} className="w-full rounded-lg bg-input px-2 py-2 text-sm" placeholder="None" />
            </div>
          </div>
        )}

        <div>
          <p className="mb-1 text-[10px] uppercase text-muted-foreground">Shipping ($)</p>
          <input type="number" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} className="w-full rounded-lg bg-input px-3 py-2 text-sm" />
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Edit description</summary>
          <textarea
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1 w-full resize-none rounded-lg bg-input px-3 py-2 text-sm"
            placeholder="Description"
          />
        </details>

        <button
          onClick={() => {
            const frontErr = validateListingImage(frontImage, { field: "Photo" });
            if (frontErr) return toast.error(frontErr);
            const amount = Number(price) || 0;
            if (buyNow && amount <= 0) return toast.error("Set a price");
            if (auction && amount <= 0) return toast.error("Set a starting bid");
            onSubmit({
              buy_now: buyNow, auction, offer, days, price: amount,
              reserve: reserve ? Number(reserve) : undefined,
              frontImage, backImage,
              description: desc,
              shipping: Number(shipping) || 0,
            });
          }}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
        >
          List for sale
        </button>
      </div>
    </div>
  );
}


