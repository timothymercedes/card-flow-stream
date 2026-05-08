import { useRouter, useLocation, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function BackButton({ to, className = "" }: { to?: string; className?: string }) {
  const router = useRouter();
  const loc = useLocation();
  // Hide on home
  if (loc.pathname === "/") return null;

  if (to) {
    return (
      <Link
        to={to}
        aria-label="Back"
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/80 ${className}`}
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else router.navigate({ to: "/" });
      }}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/80 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  );
}
