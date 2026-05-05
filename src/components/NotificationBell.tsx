import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Notif = { id: string; type: string; body: string; link: string | null; read: boolean; created_at: string };

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id,type,body,link,read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as Notif[]) || []);
  }

  useEffect(() => {
    if (!user) { setItems([]); return; }
    load();
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (!user) return null;
  const unread = items.filter((n) => !n.read).length;

  async function markAllRead() {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    load();
  }

  async function openItem(n: Notif) {
    if (!n.read) await supabase.from("notifications").update({ read: true }).eq("id", n.id);
    setOpen(false);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-live px-1 text-[9px] font-bold text-live-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="mt-12 max-h-[70vh] w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-bold">Notifications</p>
              <div className="flex items-center gap-2">
                {unread > 0 && <button onClick={markAllRead} className="text-[10px] text-primary">Mark all read</button>}
                <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && <p className="px-4 py-12 text-center text-xs text-muted-foreground">No notifications yet.</p>}
              {items.map((n) => {
                const inner = (
                  <div className={`flex flex-col gap-0.5 border-b border-border/50 px-4 py-3 ${!n.read ? "bg-primary/5" : ""}`}>
                    <p className="text-xs leading-snug">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                );
                return n.link
                  ? <Link key={n.id} to={n.link as any} onClick={() => openItem(n)}>{inner}</Link>
                  : <button key={n.id} onClick={() => openItem(n)} className="w-full text-left">{inner}</button>;
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
