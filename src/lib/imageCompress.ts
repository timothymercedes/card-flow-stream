/**
 * Client-side image compression for mobile uploads.
 *
 * Phone cameras produce 4–12MB photos (and iPhones default to HEIC, which
 * browsers can't render). Downscaling + re-encoding to JPEG on-device makes
 * uploads fast on cellular networks and guarantees a web-displayable file.
 *
 * Runs entirely in the browser (canvas) — never import from server code.
 */

export type CompressOptions = {
  /** Longest-edge cap in px. Default 1600 — plenty for card detail. */
  maxDimension?: number;
  /** JPEG quality 0–1. Default 0.82. */
  quality?: number;
};

const DEFAULTS: Required<CompressOptions> = { maxDimension: 1600, quality: 0.82 };

function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  // Prefer createImageBitmap (handles orientation + is faster), fall back to <img>.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" } as any).then((bmp) => ({
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      cleanup: () => bmp.close?.(),
    }));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

/**
 * Compress an image File. Returns a new JPEG File, or the original file
 * unchanged if it isn't a raster image or compression fails (caller still
 * gets a usable File so uploads never hard-fail on a compression edge case).
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality } = { ...DEFAULTS, ...opts };
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) return file;
  // Already-tiny SVG/GIF: leave alone (canvas would rasterize/animate-flatten).
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const bmp = await loadBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.cleanup(); return file; }
    // White matte so transparent PNGs don't turn black when flattened to JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    bmp.draw(ctx, w, h);
    bmp.cleanup();

    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    // If compression didn't help (rare for already-small web images), keep original.
    if (blob.size >= file.size && file.type === "image/jpeg") return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
