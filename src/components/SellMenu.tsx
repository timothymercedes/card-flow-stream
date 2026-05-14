import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Plus, Radio, Tag, Calendar, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * SellMenu — replaces the single Sell button with a 3-option popover:
 * Go Live, List Item, Schedule Show. Host-friendly entry point.
 */
export function SellMenu() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t("nav.sell")}
        className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {t("nav.sell")}
      </button>

      {open && typeof document !== "undefined" && createPortal((
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-t-2xl bg-card p-4 text-card-foreground shadow-2xl ring-1 ring-border md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider">What do you want to do?</h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-2">
              <Link
                to="/live"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 p-3 text-left text-white shadow"
              >
                <Radio className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">Go Live</p>
                  <p className="text-[11px] text-white/85">Start a live auction stream now</p>
                </div>
              </Link>

              <Link
                to="/sell"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl bg-primary p-3 text-left text-primary-foreground shadow"
              >
                <Tag className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">List Item</p>
                  <p className="text-[11px] opacity-90">Add a card or item to the marketplace</p>
                </div>
              </Link>

              <Link
                to="/shows/$id/edit" params={{ id: "new" }}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 p-3 text-left text-white shadow"
              >
                <Calendar className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">Schedule Show</p>
                  <p className="text-[11px] text-white/85">Plan an upcoming live show with Pre-B items</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
