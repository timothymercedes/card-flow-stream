import { useEffect, useState } from "react";

const BUCKET_MS = 5 * 60 * 1000;

export function currentBucket() {
  return Math.floor(Date.now() / BUCKET_MS);
}

/** Returns a bucket id that changes every 5 minutes. SSR-safe (starts at 0). */
export function useShuffleBucket() {
  const [bucket, setBucket] = useState(0);
  useEffect(() => {
    setBucket(currentBucket());
    const tick = () => setBucket(currentBucket());
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return bucket;
}

export function seededHash(id: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = ((h * 31) ^ id.charCodeAt(i)) >>> 0;
  return h;
}

export function shuffleBy<T extends { id: string }>(arr: T[], seed: number) {
  return [...arr].sort((a, b) => seededHash(a.id, seed) - seededHash(b.id, seed));
}
