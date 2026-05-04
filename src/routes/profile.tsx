import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { LogOut, Radio, Tag, Package, User } from "lucide-react";

export const Route = createFileRoute("/profile")({ component: Profile });

function Profile() {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();

  if (!user) return (
    <AppShell>
      <div className="px-6 py-16 text-center">
        <h1 className="text-xl font-bold">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to view your profile.</p>
        <Link to="/auth" className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign In</Link>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <div className="px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {profile?.username?.[0]?.toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-lg font-bold">@{profile?.username}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
            {profile?.is_seller && <span className="mt-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">SELLER</span>}
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <Link to="/sell" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <Radio className="h-5 w-5 text-live" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Go Live</p>
              <p className="text-xs text-muted-foreground">Start a live auction stream</p>
            </div>
          </Link>
          <Link to="/sell" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <Tag className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">List an Item</p>
              <p className="text-xs text-muted-foreground">Sell or auction a card</p>
            </div>
          </Link>
          <Link to="/orders" className="flex items-center gap-3 rounded-xl bg-card p-4">
            <Package className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">My Orders</p>
              <p className="text-xs text-muted-foreground">Track shipping & purchases</p>
            </div>
          </Link>
          <button onClick={async () => { await signOut(); nav({ to: "/" }); }} className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left">
            <LogOut className="h-5 w-5 text-destructive" />
            <p className="text-sm font-semibold">Sign Out</p>
          </button>
        </div>
      </div>
    </AppShell>
  );
}
