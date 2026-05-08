import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  createConnectOnboardingLink,
  syncConnectAccountStatus,
  getMyConnectStatus,
} from "@/server/stripe-connect.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { SellerAgreementGate } from "@/components/SellerAgreementGate";
import { HeaderSearch } from "@/components/HeaderSearch";

export const Route = createFileRoute("/payouts")({
  component: PayoutsPage,
  errorComponent: ({ error, reset }) => {
    console.error("payouts route error", error);
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold">Couldn't load payouts</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
          <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Retry</button>
        </div>
      </div>
    );
  },
});

function PayoutsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const getStatus = useServerFn(getMyConnectStatus);
  const sync = useServerFn(syncConnectAccountStatus);
  const createLink = useServerFn(createConnectOnboardingLink);

  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    refresh();
  }, [user, authLoading]);

  // Auto-sync if returning from Stripe onboarding
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "stripe") {
      handleSync();
    }
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const s = await getStatus();
      setStatus(s);
    } catch (e: any) {
      console.error("getMyConnectStatus failed", e);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { url } = await createLink({
        data: {
          returnUrl: `${origin}/payouts?from=stripe`,
          refreshUrl: `${origin}/payouts`,
        },
      });
      // Stripe blocks iframes — open in top-level window / new tab
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Popup blocked — break out of iframe
        if (window.top && window.top !== window.self) {
          window.top.location.href = url;
        } else {
          window.location.href = url;
        }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not start onboarding");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      await sync();
      await refresh();
      toast.success("Account status updated");
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ready = status?.charges_enabled && status?.payouts_enabled;

  return (
    <SellerAgreementGate>
    <div className="container max-w-2xl py-8 space-y-6">
      <HeaderSearch />
      <div>
        <h1 className="text-3xl font-bold">Payouts</h1>
        <p className="text-muted-foreground">Connect your Stripe account to receive payments from buyers.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Stripe Connect
            {ready ? (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Active
              </Badge>
            ) : status ? (
              <Badge variant="secondary">
                <AlertCircle className="h-3 w-3 mr-1" /> Incomplete
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            We use Stripe to securely process payments and send funds to your bank. The platform
            takes a 5% fee per sale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <StatusRow label="Charges enabled" ok={!!status.charges_enabled} />
              <StatusRow label="Payouts enabled" ok={!!status.payouts_enabled} />
              <StatusRow label="Details submitted" ok={!!status.details_submitted} />
              <div className="text-muted-foreground">
                Deliveries: <span className="text-foreground font-medium">{status.deliveries_count ?? 0}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {!status || !ready ? (
              <Button onClick={handleConnect} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {status ? "Continue Stripe onboarding" : "Connect Stripe account"}
              </Button>
            ) : null}
            {status && (
              <Button variant="outline" onClick={handleSync} disabled={busy}>
                Refresh status
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    </SellerAgreementGate>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-500" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
