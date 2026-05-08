#!/usr/bin/env node
/**
 * Record a tutorial by driving the REAL PullBidLive app.
 *
 * - Playwright launches Chromium at the published / preview URL.
 * - `?tour=1` activates TutorialModeBootstrap (admin-gated in prod) so login,
 *   Stripe Connect, and seller approval gates are bypassed for the recording
 *   session only — never in production for non-admins.
 * - For every step we read the targeted element's bounding rect and pin a
 *   label + animated cursor to those coordinates. The cursor click and the
 *   real `page.click()` fire at the same pixel.
 * - WebM (Playwright recordVideo) is muxed with TTS narration via ffmpeg into
 *   the final MP4.
 *
 * Usage:
 *   node record.mjs bid|host|seller-hub|all
 */
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scenes } from "./scenes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PBL_BASE_URL || "https://card-flow-stream.lovable.app";
const BETA = process.env.PBL_BETA_PASSWORD || "";
const OUT = join(__dirname, "out");
const VIEWPORT = { width: 414, height: 896 }; // mobile portrait — matches real users

function sh(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts });
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} → ${c}`))));
  });
}

/** Inject overlay + cursor into the page. Persists across SPA navigations. */
async function installOverlay(page) {
  await page.addInitScript(() => {
    if (window.__pblOverlayInstalled) return;
    window.__pblOverlayInstalled = true;
    const css = `
      #__pbl_cursor__{position:fixed;width:28px;height:28px;border-radius:50%;
        background:radial-gradient(circle,#fff 0 30%,rgba(255,255,255,.25) 30% 60%,transparent 60%);
        box-shadow:0 0 0 2px rgba(0,0,0,.4),0 6px 18px rgba(0,0,0,.5);
        pointer-events:none;z-index:2147483646;transform:translate(-50%,-50%);
        transition:left .6s cubic-bezier(.4,.0,.2,1), top .6s cubic-bezier(.4,.0,.2,1);}
      #__pbl_cursor__.click::after{content:"";position:absolute;inset:-12px;border-radius:50%;
        border:3px solid #ec4899;animation:pbl-ripple .5s ease-out forwards;}
      @keyframes pbl-ripple{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}
      .__pbl_label__{position:fixed;z-index:2147483645;pointer-events:none;
        background:linear-gradient(135deg,#ec4899,#8b5cf6);color:#fff;
        font:700 13px/1.2 system-ui,sans-serif;padding:8px 12px;border-radius:10px;
        box-shadow:0 8px 24px rgba(0,0,0,.5);max-width:240px;
        animation:pbl-pop .35s ease-out;}
      .__pbl_ring__{position:fixed;z-index:2147483644;pointer-events:none;
        border-radius:14px;box-shadow:0 0 0 4px rgba(236,72,153,.85),0 0 32px rgba(236,72,153,.6);
        animation:pbl-pulse 1.4s ease-in-out infinite;}
      @keyframes pbl-pop{from{opacity:0;transform:translateY(6px) scale(.95)}to{opacity:1}}
      @keyframes pbl-pulse{0%,100%{opacity:.85}50%{opacity:.45}}
    `;
    const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
    const cursor = document.createElement("div"); cursor.id = "__pbl_cursor__";
    cursor.style.left = "50%"; cursor.style.top = "85%";
    document.documentElement.appendChild(cursor);

    let raf = 0, current = null;
    function tick() {
      if (!current) return;
      const el = document.querySelector(current.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        // Ring locked to element rect.
        const ring = document.getElementById("__pbl_ring__");
        if (ring) {
          ring.style.left = (r.left - 6) + "px";
          ring.style.top = (r.top - 6) + "px";
          ring.style.width = (r.width + 12) + "px";
          ring.style.height = (r.height + 12) + "px";
        }
        // Label positioned above (or below if too close to top).
        const lbl = document.getElementById("__pbl_label__");
        if (lbl) {
          const lr = lbl.getBoundingClientRect();
          const above = r.top > lr.height + 16;
          lbl.style.left = Math.max(8, Math.min(window.innerWidth - lr.width - 8, r.left + r.width / 2 - lr.width / 2)) + "px";
          lbl.style.top = (above ? r.top - lr.height - 10 : r.bottom + 10) + "px";
        }
      }
      raf = requestAnimationFrame(tick);
    }

    window.__pblShowLabel = (selector, text) => {
      window.__pblHideLabel();
      current = { selector };
      const ring = document.createElement("div"); ring.id = "__pbl_ring__"; ring.className = "__pbl_ring__";
      const lbl = document.createElement("div"); lbl.id = "__pbl_label__"; lbl.className = "__pbl_label__"; lbl.textContent = text;
      document.documentElement.appendChild(ring);
      document.documentElement.appendChild(lbl);
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    };
    window.__pblHideLabel = () => {
      current = null;
      document.getElementById("__pbl_ring__")?.remove();
      document.getElementById("__pbl_label__")?.remove();
      cancelAnimationFrame(raf);
    };
    window.__pblMoveCursor = (x, y) => { cursor.style.left = x + "px"; cursor.style.top = y + "px"; };
    window.__pblClickBurst = () => {
      cursor.classList.remove("click"); void cursor.offsetWidth; cursor.classList.add("click");
    };
    window.__pblRect = (selector) => {
      const el = document.querySelector(selector); if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    };
  });
}

async function ensureBetaCookie(page) {
  if (!BETA) return;
  await page.evaluate((pw) => {
    document.cookie = `pbl_beta=1; path=/; max-age=2592000; SameSite=Lax`;
    localStorage.setItem("pbl_beta_access", "1");
  }, BETA);
}

async function recordScene(name, steps) {
  const sceneDir = join(OUT, name);
  await mkdir(sceneDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    recordVideo: { dir: sceneDir, size: VIEWPORT },
  });
  const page = await ctx.newPage();
  await installOverlay(page);

  const lines = [];
  let stepIdx = 0;

  for (const step of steps) {
    if (!step) continue;
    if (step.goto) {
      const url = new URL(step.goto, BASE).toString();
      const sep = url.includes("?") ? "&" : "?";
      await page.goto(url + sep + "tour=1", { waitUntil: "domcontentloaded" });
      await ensureBetaCookie(page);
      if (step.wait) await page.waitForSelector(step.wait, { timeout: 15000 }).catch(() => {});
      else await page.waitForTimeout(1200);
    }
    if (step.target) {
      const exists = await page.$(step.target);
      if (!exists) {
        console.warn(`[skip] missing selector ${step.target} — anchor not on page`);
        continue;
      }
      await page.evaluate(({ sel, text }) => window.__pblShowLabel(sel, text), { sel: step.target, text: step.label });
      const rect = await page.evaluate((sel) => window.__pblRect(sel), step.target);
      if (rect) {
        await page.evaluate(({ x, y }) => window.__pblMoveCursor(x, y), rect);
        await page.waitForTimeout(700);
        if (step.click !== false) {
          await page.evaluate(() => window.__pblClickBurst());
          await page.click(step.target, { trial: false }).catch(() => {});
        }
      }
    }
    if (step.voice) lines.push({ idx: stepIdx, text: step.voice, t: Date.now() });
    await page.waitForTimeout(step.target ? 1800 : 1400);
    if (step.target) await page.evaluate(() => window.__pblHideLabel());
    stepIdx++;
  }

  await page.waitForTimeout(800);
  const video = page.video();
  await ctx.close();
  await browser.close();
  const webm = await video.path();
  const mp4 = join(OUT, `${name}.mp4`);

  // Transcode WebM → MP4 (h264 + faststart). Narration mux is left as a
  // separate ffmpeg pass once TTS audio is generated for `lines`.
  await sh("ffmpeg", ["-y", "-i", webm, "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", "-an", mp4]);

  await writeFile(join(OUT, `${name}.narration.json`), JSON.stringify(lines, null, 2));
  console.log(`✓ ${name} → ${mp4}`);
  console.log(`  narration script → ${name}.narration.json (feed to ElevenLabs, mux with ffmpeg -i mp4 -i mp3 -c copy out.mp4)`);
}

async function main() {
  const which = process.argv[2] || "all";
  await mkdir(OUT, { recursive: true });
  const list = which === "all" ? Object.keys(scenes) : [which];
  for (const name of list) {
    if (!scenes[name]) { console.error(`unknown scene "${name}"`); process.exit(1); }
    await recordScene(name, scenes[name]);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
