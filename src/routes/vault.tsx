import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { Trash2, Plus, Camera, Tag, Pencil, X, DollarSign, Lock, Users, UserCheck, Globe, Search, Mic, MicOff, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
const CardScanner = lazy(() => import("@/components/CardScanner").then(m => ({ default: m.CardScanner })));
import { WatchTutorial } from "@/components/WatchTutorial";
import { CardPriceChart } from "@/components/CardPriceChart";

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
  visibility?: Visibility | null;
};

function Vault() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [selling, setSelling] = useState<Card | null>(null);
  const [actionFor, setActionFor] = useState<Card | null>(null);
  const [vaultVisibility, setVaultVisibility] = useState<Visibility>("private");
  const [savingVis, setSavingVis] = useState(false);
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [listening, setListening] = useState(false);
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
  // (vault-wide visibility lives on vault_settings, not per card)
  const [identifying, setIdentifying] = useState(false);
  type TcgPrices = Record<string, { market?: number; mid?: number; low?: number; high?: number } | undefined>;
  type Alt = { id: string; name: string; set?: string; number?: string; image?: string; price?: number; year?: string; category?: string; tcgPrices?: TcgPrices };
  const [alternatives, setAlternatives] = useState<Alt[]>([]);
  const [altIndex, setAltIndex] = useState(0);
  type Edition = "Unlimited" | "1st Edition";
  type Finish = "Holo" | "Non-Holo" | "Reverse Holo";
  const [edition, setEdition] = useState<Edition>("Unlimited");
  const [finish, setFinish] = useState<Finish>("Non-Holo");

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
    return u.startsWith("data:image") || u.includes("images.unsplash.com") || u.includes("/storage/v1/object/public/vault-images/") || u.includes("generate-card-image");
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
  async function fetchRealCardMatches(opts: { name?: string; set?: string; number?: string; category?: string }) {
    const csvGame = detectTcgCsvGame(opts.category, opts.name, opts.set);
    if (csvGame) {
      const csv = await fetchTcgCsvMatches(csvGame, opts);
      if (csv.length) return csv;
    }
    const game = detectGame(opts.category, opts.name, opts.set);
    if (game === "mtg") return fetchMtgMatches(opts);
    if (game === "yugioh") return fetchYugiohMatches(opts);
    const safeName = cleanSearchText(opts.name).replace(/"/g, "");
    const safeSet = cleanSearchText(opts.set).replace(/"/g, "");
    const safeNumber = cardNumberBase(opts.number).replace(/"/g, "");
    if (!safeName && !safeSet && !safeNumber) return [] as Alt[];
    if (game === "unknown" && safeName) {
      const pkmn = await fetchPokemonMatches(safeName, safeSet, safeNumber);
      if (pkmn.length) return pkmn;
      const mtg = await fetchMtgMatches(opts);
      if (mtg.length) return mtg;
      const ygo = await fetchYugiohMatches(opts);
      if (ygo.length) return ygo;
      // Last resort: try every TCGCSV game by name
      for (const g of ["One Piece", "Lorcana", "Dragon Ball Super Fusion", "Star Wars Unlimited", "Flesh and Blood"]) {
        const r = await fetchTcgCsvMatches(g, opts);
        if (r.length) return r;
      }
      return [];
    }
    return fetchPokemonMatches(safeName, safeSet, safeNumber);
  }

  async function fetchPokemonMatches(safeName: string, safeSet: string, safeNumber: string): Promise<Alt[]> {
    const queries = [
      [safeName && `name:"${safeName}"`, safeNumber && `number:"${safeNumber}"`].filter(Boolean).join(" "),
      [safeNumber && `number:"${safeNumber}"`, safeSet && `set.name:"${safeSet}"`].filter(Boolean).join(" "),
      [safeName && `name:"${safeName}"`, safeSet && `set.name:"${safeSet}"`].filter(Boolean).join(" "),
      [safeName && `name:"${safeName}"`].filter(Boolean).join(" "),
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
  }

  async function backfillMissingPrices(list: Card[]) {
    const stale = list.filter((c) => {
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

  async function backfillMissingImages(list: Card[]) {
    const missing = list.filter((c) => needsOfficialCardImage(c.image_url) && (c.name || c.tcg_number || c.tcg_set));
    if (!missing.length) return;
    let updated = 0;
    for (const c of missing.slice(0, 25)) {
      const matches = await fetchRealCardMatches({ name: c.name, set: c.tcg_set || undefined, number: c.tcg_number || undefined, category: c.category || undefined });
      const match = matches.find((m) => m.image);
      const img = match?.image;
      if (!img) continue;
      const cp = conditionPricesFromMarket(match?.price) || c.condition_prices || null;
      const newValue = cp ? priceFor((c.condition || "NM") as Condition, Number(cp.NM) || Number(match?.price) || 0, cp) : c.estimated_value;
      const patch = {
        image_url: img,
        name: match?.name || c.name,
        tcg_set: match?.set || c.tcg_set,
        tcg_number: match?.number || c.tcg_number,
        tcg_year: match?.year || c.tcg_year,
        category: match?.category || c.category || "Pokémon",
        condition_prices: cp as any,
        estimated_value: newValue,
        last_valued_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("vault_cards").update(patch).eq("id", c.id);
      if (!error) {
        updated++;
        setCards((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch, condition_prices: cp } : x)));
        setActionFor((prev) => (prev && prev.id === c.id ? { ...prev, ...patch, condition_prices: cp } : prev));
      }
    }
    if (updated > 0) toast.success(`Added images to ${updated} card${updated > 1 ? "s" : ""}`);
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

  const totalValue = useMemo(
    () => cards.reduce((s, c) => s + Number(c.estimated_value || 0), 0),
    [cards]
  );

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? cards.filter((c) =>
          [c.name, c.tcg_set, c.tcg_year, c.tcg_number, c.category]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(q))
        )
      : cards;
    return [...base].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [cards, query]);

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
    setEdition("Unlimited"); setFinish("Non-Holo");
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
    let finalImage = imageUrl;
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
        if (img?.image) finalImage = img.image;
      } catch {/* ignore */}
    }
    const variantLabel = `${edition} · ${finish}`;
    const fullDesc = [description?.trim(), `Variant: ${variantLabel}`].filter(Boolean).join("\n");
    const { error } = await supabase.from("vault_cards").insert({
      user_id: user!.id, name: finalName, category: cat || "Trading Card",
      image_url: finalImage || null, back_image_url: backImageUrl || null,
      description: fullDesc || null,
      estimated_value: value,
      condition_prices: cp as any,
      price: price ? Number(price) : null,
      tcg_number: num2 || null, tcg_set: setName2 || null, tcg_year: year2 || null,
      condition,
      language,
      last_valued_at: new Date().toISOString(),
    });
    if (error) return toast.error(error.message);
    resetForm(); setShowAdd(false);
    load();
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

  async function saveEdit() {
    if (!editing) return;
    // estimated_value is auto-managed by TCG; recompute from condition_prices if condition changed
    let newValue = editing.estimated_value;
    if (editing.condition_prices) {
      newValue = priceFor((editing.condition || "NM") as Condition, Number(editing.condition_prices.NM || editing.estimated_value || 0), editing.condition_prices);
    }
    const { error } = await supabase.from("vault_cards").update({
      name: editing.name, category: editing.category, image_url: editing.image_url,
      back_image_url: editing.back_image_url || null,
      description: editing.description,
      price: editing.price != null ? Number(editing.price) : null,
      tcg_number: editing.tcg_number || null, tcg_set: editing.tcg_set || null, tcg_year: editing.tcg_year || null,
      condition: editing.condition || null,
      
      estimated_value: newValue,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
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
    set?: string; year?: string; tcg_number?: string; variant?: string; language?: string;
    estimated_value?: number; condition_prices?: ConditionPrices;
  }) {
    if (!user) return;
    const cp: ConditionPrices | null = r.condition_prices || null;
    const baseNm = Number(r.estimated_value) > 0 ? Number(r.estimated_value) : (cp?.NM || 1);
    const value = priceFor("NM", baseNm, cp);
    const lang = r.language || language || "en";

    const payload = {
      user_id: user.id,
      name: r.name,
      category: r.category || "Trading Card",
      image_url: r.image || null,
      back_image_url: null,
      description: r.variant && r.variant !== "Standard" ? `Variant: ${r.variant}` : null,
      estimated_value: value,
      condition_prices: cp as any,
      price: null,
      tcg_number: r.tcg_number || null,
      tcg_set: r.set || null,
      tcg_year: r.year ? String(r.year) : null,
      condition: "NM" as Condition,
      language: lang,
      last_valued_at: new Date().toISOString(),
    };

    setScanning(false);

    // Retry up to 3 times on transient failure so we never silently drop a scan.
    let lastErr: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from("vault_cards").insert(payload);
      if (!error) {
        toast.success(`✅ ${r.name} saved to vault`);
        load();
        return;
      }
      lastErr = error;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    toast.error(`Couldn't save card — ${lastErr?.message || "try again"}`);
  }

  async function listForSale(card: Card, opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number; reserve?: number; backImage?: string }) {
    if (!card.image_url) return toast.error("Front photo required");
    const back = card.back_image_url || opts.backImage;
    if (!back) return toast.error("Back photo required to sell");
    if (opts.buy_now && opts.price <= 0) return toast.error("Set a Buy Now price");
    if (opts.auction && opts.price <= 0) return toast.error("Set a starting bid");
    if (!profile?.is_seller) await supabase.from("profiles").update({ is_seller: true }).eq("id", user!.id);
    const primary: "buy_now" | "auction" | "offer" = opts.auction ? "auction" : opts.buy_now ? "buy_now" : "offer";
    const condDesc = card.condition ? ` — Condition: ${card.condition}` : "";
    const { data, error } = await supabase.from("listings").insert({
      seller_id: user!.id, title: card.name,
      description: (card.description || `From my vault — ${card.category || "Trading Card"}`) + condDesc,
      image_url: card.image_url,
      back_image_url: back,
      listing_type: primary,
      is_auction: opts.auction,
      accepts_offers: opts.offer,
      price: opts.buy_now ? opts.price : null,
      starting_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      current_bid: opts.auction ? Math.max(1, opts.price || 1) : null,
      reserve_price: opts.auction && opts.reserve ? opts.reserve : null,
      auction_ends_at: opts.auction ? new Date(Date.now() + opts.days * 24 * 60 * 60 * 1000).toISOString() : null,
      condition: card.condition || null,
      tcg_number: card.tcg_number || null,
      tcg_set: card.tcg_set || null,
      tcg_year: card.tcg_year || null,
    }).select().single();
    if (error) return toast.error(error.message);
    // Persist back image to vault if newly captured
    if (!card.back_image_url && opts.backImage) {
      await supabase.from("vault_cards").update({ back_image_url: opts.backImage }).eq("id", card.id);
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
      <div className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My Vault</h1>
          <div className="flex gap-2">
            <button onClick={() => setScanning(true)} className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"><Camera className="h-3 w-3" /> Scan</button>
            <button onClick={() => { resetForm(); setShowAdd(true); }} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Plus className="h-3 w-3" /> Add</button>
          </div>
        </div>
        <div className="mb-3"><WatchTutorial routePath="/vault" label="How vaults work" /></div>
        {/* Total value (owner only) */}
        <div className="mb-3 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Vault Value</p>
          <p className="text-3xl font-bold">${totalValue.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">{cards.length} card{cards.length !== 1 ? "s" : ""}</p>
        </div>

        {/* Vault sharing (one setting for the whole vault) */}
        <div className="mb-4 rounded-xl bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold">Who can see your vault</p>
            {savingVis && <span className="text-[10px] text-muted-foreground">Saving…</span>}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {([
              { v: "private",   l: "Only me",   I: Lock },
              { v: "friends",   l: "Friends",   I: UserCheck },
              { v: "followers", l: "Followers", I: Users },
              { v: "public",    l: "Public",    I: Globe },
            ] as const).map(({ v, l, I }) => (
              <button key={v} type="button" onClick={() => updateVaultVisibility(v)}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold ${vaultVisibility === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
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
            <div className="flex gap-2">
              <button onClick={add} className="flex-1 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save</button>
              <button onClick={() => { setShowAdd(false); resetForm(); }} className="rounded-lg bg-muted px-3 py-2 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Search */}
        {cards.length > 0 && (
          <div className="relative mb-3">
            <div className="flex items-center gap-2 rounded-xl bg-input px-3 py-2">
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
            {showSuggest && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
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
            )}
          </div>
        )}

        {cards.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Your vault is empty</p>}
        {cards.length > 0 && filteredCards.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No cards match "{query}"</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {filteredCards.map((c) => {
            const meta = [c.tcg_set, c.tcg_year, c.tcg_number && `#${c.tcg_number}`].filter(Boolean).join(" • ");
            const cv = parseVariant(c.description);
            return (
              <button key={c.id} onClick={() => setActionFor(c)} className="overflow-hidden rounded-xl bg-card text-left active:scale-[0.98]">
                <div className="relative aspect-square bg-muted">
                  {c.image_url ? <img src={c.image_url} loading="lazy" decoding="async" className="h-full w-full object-cover" alt={c.name} /> : <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent" />}
                  {/* Edition badge — overlays the print-stamp corner so the chosen edition is the visible truth */}
                  {cv.edition === "1st Edition" ? (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md border border-yellow-300/80 bg-black/85 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-yellow-300 shadow-lg">
                      1st Edition
                    </span>
                  ) : (
                    <span className="absolute bottom-1.5 left-1.5 rounded-md border border-white/30 bg-black/80 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-white/90 shadow-lg">
                      Unlimited
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="line-clamp-1 text-sm font-semibold">{c.name}</p>
                  {meta && <p className="line-clamp-1 text-[10px] text-muted-foreground">{meta}</p>}
                  <p className="text-[10px] text-muted-foreground">
                    {c.category || "—"}{c.condition && ` • ${c.condition}`}
                  </p>
                  {Number(c.estimated_value || 0) > 0 && (
                    <p className="mt-0.5 text-xs font-bold text-primary">${Number(c.estimated_value).toFixed(2)}</p>
                  )}
                </div>
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Front</p>
                <div className="relative">
                  {actionFor.image_url
                    ? <img src={actionFor.image_url} className="aspect-[3/4] w-full rounded-lg object-cover" alt={actionFor.name} />
                    : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">No photo</div>}
                  {parseVariant(actionFor.description).edition === "1st Edition" ? (
                    <span className="absolute bottom-2 left-2 rounded-md border border-yellow-300/80 bg-black/85 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300 shadow-lg">
                      1st Edition
                    </span>
                  ) : (
                    <span className="absolute bottom-2 left-2 rounded-md border border-white/30 bg-black/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white/90 shadow-lg">
                      Unlimited
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Back</p>
                {actionFor.back_image_url
                  ? <img src={actionFor.back_image_url} className="aspect-[3/4] w-full rounded-lg object-cover" alt="" />
                  : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-muted text-center text-[10px] text-muted-foreground">No back photo<br/>(needed to sell)</div>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted/40 p-2">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-[9px] uppercase text-muted-foreground">Estimated value</p>
                  <button
                    type="button"
                    onClick={() => { const v = parseVariant(actionFor.description); updateVariant(actionFor, v.edition, v.finish); }}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground hover:bg-muted/80"
                  >
                    Refresh
                  </button>
                </div>
                {Number(actionFor.estimated_value || 0) > 0 && (
                  <p className="text-base font-bold text-primary">${Number(actionFor.estimated_value).toFixed(2)}</p>
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
                {actionFor.condition_prices && (
                  <p className="mt-1 text-[9px] text-muted-foreground">Market value auto-updates from TCG condition prices</p>
                )}
              </div>
            </div>

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


            {actionFor.description && (
              <div className="rounded-lg bg-muted/40 p-2 text-xs">
                <p className="text-[9px] uppercase text-muted-foreground">Description</p>
                <p className="mt-0.5 whitespace-pre-wrap">{actionFor.description}</p>
              </div>
            )}

            <CardPriceChart name={actionFor.name} tcgSet={actionFor.tcg_set} tcgNumber={actionFor.tcg_number} />


            <button onClick={() => { setSelling(actionFor); setActionFor(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground">
              <Tag className="h-4 w-4" /> Sell this card
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setEditing(actionFor); setActionFor(null); }} className="flex items-center justify-center gap-2 rounded-lg bg-muted py-2.5 text-sm">
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <button onClick={() => { remove(actionFor.id); setActionFor(null); }} className="flex items-center justify-center gap-2 rounded-lg bg-destructive/20 py-2.5 text-sm text-destructive">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md space-y-2 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-bold">Edit card</p>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            {editing.image_url && <img src={editing.image_url} className="mx-auto h-32 rounded-lg object-cover" alt="" />}
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
            <button onClick={saveEdit} className="w-full rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground">Save changes</button>
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
  onSubmit: (opts: { buy_now: boolean; auction: boolean; offer: boolean; days: number; price: number; reserve?: number; backImage?: string }) => void;
}) {
  const [buyNow, setBuyNow] = useState(true);
  const [auction, setAuction] = useState(false);
  const [offer, setOffer] = useState(false);
  const [days, setDays] = useState(3);
  const [price, setPrice] = useState(String(card.price ?? card.estimated_value ?? 1));
  const [reserve, setReserve] = useState("");
  const [backImage, setBackImage] = useState<string>(card.back_image_url || "");

  function onBackFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setBackImage(String(r.result));
    r.readAsDataURL(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-bold">Sell "{card.name}"</p>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Front</p>
            {card.image_url ? <img src={card.image_url} className="mt-1 h-24 w-full rounded-lg object-cover" alt="" /> : <p className="text-[10px] text-destructive">Missing</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Back {backImage ? "" : "(required)"}</p>
            {backImage ? <img src={backImage} className="mt-1 h-24 w-full rounded-lg object-cover" alt="" /> : <div className="mt-1 flex h-24 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">No back photo</div>}
            <input type="file" accept="image/*" onChange={onBackFile} className="mt-1 block w-full text-[10px]" />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">Choose one or more listing options</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" checked={buyNow} onChange={(e) => setBuyNow(e.target.checked)} className="h-4 w-4" /> Buy Now
          </label>
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" checked={offer} onChange={(e) => setOffer(e.target.checked)} className="h-4 w-4" /> Accept Offers
          </label>
          <label className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <input type="checkbox" checked={auction} onChange={(e) => setAuction(e.target.checked)} className="h-4 w-4" /> Auction
          </label>
          {auction && (
            <>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Auction length</p>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-lg bg-input px-3 py-2 text-sm">
                  {[1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase text-muted-foreground">Reserve / minimum (optional)</p>
                <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <input type="number" min="0" step="0.01" value={reserve} onChange={(e) => setReserve(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder="No sale below this amount" />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">If the top bid is below this, you'll be asked to accept or decline.</p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-input px-3 py-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1 bg-transparent text-sm outline-none" placeholder={auction ? "Starting bid" : "Price"} />
        </div>
        <button
          onClick={() => {
            if (!card.image_url) return toast.error("Front photo required");
            if (!backImage) return toast.error("Back photo required");
            if (!buyNow && !auction && !offer) return toast.error("Pick at least one option");
            const amount = Number(price) || 0;
            if (buyNow && amount <= 0) return toast.error("Set a Buy Now price");
            if (auction && amount <= 0) return toast.error("Set a starting bid");
            onSubmit({ buy_now: buyNow, auction, offer, days, price: amount, reserve: reserve ? Number(reserve) : undefined, backImage });
          }}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
        >
          List for sale
        </button>
      </div>
    </div>
  );
}

