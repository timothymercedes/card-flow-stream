import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { FormEvent, useState } from "react";

export function HeaderSearch({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    navigate({ to: "/discover", search: term ? { q: term } : {} } as any);
  }
  return (
    <form onSubmit={onSubmit} className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search cards, users, hosts, stores…"
          className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          aria-label="Search"
        />
      </div>
    </form>
  );
}
