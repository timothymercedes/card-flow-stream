// PullBid Arena — outdoor battle environment.
// Renders a layered, parallax-y open-air arena (sky, sun, drifting clouds,
// distant hills and a grounded battlefield) so companions look like they are
// fighting OUTSIDE in a real arena — not on a flat card backdrop. Each
// collecting category gets its own daytime/dusk environment via a CSS class.
// Purely decorative: sits behind the fighters at z-0.

const ENV_CLASS: Record<string, string> = {
  pokemon: "arena-env-pokemon",
  onepiece: "arena-env-onepiece",
  mtg: "arena-env-mtg",
  yugioh: "arena-env-yugioh",
  sports: "arena-env-sports",
  lorcana: "arena-env-lorcana",
  wrestling: "arena-env-wrestling",
  marvel: "arena-env-marvel",
  starwars: "arena-env-starwars",
};

export function ArenaBackdrop({ category = "all", shake = false }: { category?: string; shake?: boolean }) {
  const envClass = ENV_CLASS[category] ?? "arena-env-default";
  return (
    <div className={`arena-scene ${envClass} ${shake ? "arena-scene-shake" : ""}`} aria-hidden>
      {/* Sky */}
      <div className="arena-sky" />
      {/* Sun / light source */}
      <div className="arena-sun" />
      {/* Drifting clouds */}
      <span className="arena-cloud arena-cloud-1" />
      <span className="arena-cloud arena-cloud-2" />
      <span className="arena-cloud arena-cloud-3" />
      {/* Distant hills / horizon silhouette */}
      <div className="arena-hills arena-hills-back" />
      <div className="arena-hills arena-hills-front" />
      {/* Battlefield ground with perspective floor lines */}
      <div className="arena-ground" />
      <div className="arena-ground-grid" />
      {/* Soft vignette to focus the fight */}
      <div className="arena-vignette" />
    </div>
  );
}
