import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { searchUsersFn } from "@/lib/moderation.functions";
import { AdminUserDossier } from "./AdminUserDossier";

export function AdminUserSearch() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const search = useServerFn(searchUsersFn);

  async function run() {
    setLoading(true);
    try {
      const r = await search({ data: { q: q || undefined, limit: 50 } });
      setRows(r.rows);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Search by username or store name"
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded bg-background"
          />
        </div>
        <button onClick={run} className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-sm">
          Search
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setOpenId(r.id)}
                className="w-full text-left border rounded p-2 hover:bg-muted/50 flex items-center gap-2"
              >
                {r.avatar_url && (
                  <img src={r.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    @{r.username}
                    {r.shop_name && <span className="ml-2 text-muted-foreground">· {r.shop_name}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.is_seller ? "Seller · " : ""}
                    {r.verification_status} · joined {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="text-xs text-muted-foreground">No users.</li>}
        </ul>
      )}
      {openId && (
        <AdminUserDossier userId={openId} onClose={() => setOpenId(null)} onOpenUser={setOpenId} />
      )}
    </div>
  );
}
