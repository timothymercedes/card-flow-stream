/**
 * ShareSheet — universal share popup for ANY entity (live, listing, store,
 * profile, post, clip, story, upcoming show).
 *
 * Wraps the canonical share URL builder in src/lib/shareEntity.ts and exposes
 * every destination the platform supports:
 *   Copy Link, Native Share, SMS, WhatsApp, Email, X/Twitter,
 *   Facebook, Telegram, Reddit, Discord (copy), Instagram (copy).
 *
 * Designed to be opened from <ShareButton />.
 */
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Copy, Share2, MessageSquare, Mail, X as XIcon, Send,
} from "lucide-react";
import {
  buildShareUrl,
  buildShareTitle,
  buildShareDescription,
  type ShareEntity,
} from "@/lib/shareEntity";

type Destination = {
  key: string;
  label: string;
  /** Lucide icon component OR null when we render a custom SVG glyph. */
  Icon: any;
  /** brand-tinted background class */
  bg: string;
  build?: (url: string, title: string, desc: string) => string;
  /** Custom action that runs instead of opening `build()`. */
  action?: (url: string, title: string) => void | Promise<void>;
};

export function ShareSheet({
  open,
  onClose,
  entity,
}: {
  open: boolean;
  onClose: () => void;
  entity: ShareEntity;
}) {
  const url = useMemo(() => buildShareUrl(entity), [entity]);
  const title = useMemo(() => buildShareTitle(entity), [entity]);
  const desc = useMemo(() => buildShareDescription(entity), [entity]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  }

  async function systemShare() {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, text: desc, url });
        return;
      } catch { /* cancelled */ }
    }
    copy();
  }

  const dests: Destination[] = [
    { key: "copy", label: "Copy link", Icon: Copy, bg: "bg-muted text-foreground", action: copy },
    { key: "system", label: "Share…", Icon: Share2, bg: "bg-primary/15 text-primary", action: systemShare },
    {
      key: "sms", label: "SMS", Icon: MessageSquare, bg: "bg-green-500/15 text-green-500",
      build: (u, t) => `sms:?&body=${encodeURIComponent(`${t} ${u}`)}`,
    },
    {
      key: "whatsapp", label: "WhatsApp", Icon: WhatsAppGlyph, bg: "bg-emerald-500/15 text-emerald-500",
      build: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}`,
    },
    {
      key: "email", label: "Email", Icon: Mail, bg: "bg-blue-500/15 text-blue-500",
      build: (u, t, d) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(`${d}\n\n${u}`)}`,
    },
    {
      key: "x", label: "X", Icon: XGlyph, bg: "bg-foreground/10 text-foreground",
      build: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`,
    },
    {
      key: "facebook", label: "Facebook", Icon: FacebookGlyph, bg: "bg-blue-600/15 text-blue-500",
      build: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
    },
    {
      key: "telegram", label: "Telegram", Icon: Send, bg: "bg-sky-500/15 text-sky-500",
      build: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
    },
    {
      key: "reddit", label: "Reddit", Icon: RedditGlyph, bg: "bg-orange-500/15 text-orange-500",
      build: (u, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
    },
    {
      key: "discord", label: "Discord", Icon: DiscordGlyph, bg: "bg-indigo-500/15 text-indigo-400",
      action: async (u, t) => {
        try {
          await navigator.clipboard.writeText(`${t}\n${u}`);
          toast.success("Copied — paste in Discord");
          window.open("https://discord.com/channels/@me", "_blank", "noopener,noreferrer");
        } catch {
          toast.error("Couldn't copy");
        }
      },
    },
    {
      key: "instagram", label: "Instagram", Icon: InstagramGlyph, bg: "bg-pink-500/15 text-pink-500",
      action: async (u) => {
        try {
          await navigator.clipboard.writeText(u);
          toast.success("Link copied — paste in Instagram DM/Story");
        } catch {
          toast.error("Couldn't copy");
        }
      },
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share"
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-card p-4 shadow-2xl ring-1 ring-border sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Share</h2>
          <button
            onClick={onClose}
            aria-label="Close share"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{title}</p>

        <div className="mb-4 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
          <span className="flex-1 truncate text-xs font-mono text-muted-foreground">{url}</span>
          <button
            onClick={copy}
            className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
          >
            Copy
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {dests.map((d) => {
            const Icon = d.Icon;
            return (
              <button
                key={d.key}
                onClick={async () => {
                  if (d.action) await d.action(url, title);
                  else if (d.build) window.open(d.build(url, title, desc), "_blank", "noopener,noreferrer");
                }}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-[10px] font-semibold transition hover:scale-105"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full ${d.bg}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ----- Brand glyphs (kept inline so we don't add new icon deps) ----- */

function XGlyph(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function FacebookGlyph(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.5-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.77l-.44 2.89h-2.33v6.99A10 10 0 0 0 22 12z" />
    </svg>
  );
}
function WhatsAppGlyph(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 .01 5.37.01 12c0 2.11.55 4.17 1.6 5.99L0 24l6.16-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52zM12 21.83a9.83 9.83 0 0 1-5.01-1.38l-.36-.21-3.66.96.98-3.57-.24-.37A9.83 9.83 0 1 1 21.83 12 9.86 9.86 0 0 1 12 21.83zm5.39-7.34c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5a9.13 9.13 0 0 1-1.68-2.09c-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.25-.6-.5-.52-.67-.52h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.11 3.22 5.12 4.52.72.31 1.27.5 1.7.64.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z" />
    </svg>
  );
}
function RedditGlyph(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22 12.07a2.06 2.06 0 0 0-3.5-1.45c-1.4-.96-3.3-1.58-5.39-1.66l.92-4.34 3.02.64a1.5 1.5 0 1 0 .15-.95L13.7 3.5a.5.5 0 0 0-.6.38l-1.04 4.88c-2.12.07-4.05.7-5.46 1.66A2.06 2.06 0 0 0 2 12.07c0 .82.48 1.53 1.18 1.86-.04.24-.06.49-.06.74C3.12 17.6 7.07 20 12 20s8.88-2.4 8.88-5.33c0-.25-.02-.5-.06-.74A2.06 2.06 0 0 0 22 12.07zM8 14a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 8 14zm8 0a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 16 14zm-1.2 2.86c-.66.66-1.92.71-2.8.71-.88 0-2.14-.05-2.8-.71a.35.35 0 1 1 .5-.5c.42.42 1.32.57 2.3.57s1.88-.15 2.3-.57a.35.35 0 1 1 .5.5z" />
    </svg>
  );
}
function DiscordGlyph(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M20.32 4.37A19.79 19.79 0 0 0 16.06 3a14.6 14.6 0 0 0-.67 1.37 18.27 18.27 0 0 0-5.78 0A14.5 14.5 0 0 0 8.93 3 19.78 19.78 0 0 0 4.67 4.37C1.83 8.6 1.06 12.72 1.45 16.78a19.92 19.92 0 0 0 6.06 3.07 14.7 14.7 0 0 0 1.3-2.12 12.83 12.83 0 0 1-2.05-.99c.17-.13.34-.26.5-.4a14.3 14.3 0 0 0 12.5 0c.16.14.33.27.5.4-.65.39-1.34.72-2.05.99a14.7 14.7 0 0 0 1.3 2.12 19.91 19.91 0 0 0 6.06-3.07c.46-4.7-.78-8.78-3.25-12.41zM8.52 14.46c-1.2 0-2.2-1.1-2.2-2.46s.97-2.47 2.2-2.47c1.23 0 2.22 1.11 2.2 2.47 0 1.36-.98 2.46-2.2 2.46zm6.96 0c-1.2 0-2.2-1.1-2.2-2.46s.97-2.47 2.2-2.47c1.23 0 2.22 1.11 2.2 2.47 0 1.36-.97 2.46-2.2 2.46z" />
    </svg>
  );
}
function InstagramGlyph(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.71 3.71 0 0 1-1.38-.9 3.71 3.71 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.32.81.74 1.5 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-10.84a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z" />
    </svg>
  );
}
