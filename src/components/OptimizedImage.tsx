import { useState, type ImgHTMLAttributes } from "react";

interface Props extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /** Hint to the browser — set true for above-the-fold hero images. */
  priority?: boolean;
  /** Skeleton color while loading. */
  skeletonClassName?: string;
}

/**
 * Drop-in <img> with lazy loading, async decoding, and a skeleton placeholder.
 * Default behavior is mobile-first and bandwidth-friendly.
 */
export function OptimizedImage({
  src,
  alt,
  priority = false,
  className = "",
  skeletonClassName = "bg-muted/40 animate-pulse",
  onLoad,
  onError,
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className={`relative inline-block ${className}`} style={{ overflow: "hidden" }}>
      {!loaded && !failed && (
        <span className={`absolute inset-0 ${skeletonClassName}`} aria-hidden />
      )}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className={`block h-full w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={(e) => { setLoaded(true); onLoad?.(e); }}
        onError={(e) => { setFailed(true); setLoaded(true); onError?.(e); }}
        {...rest}
      />
    </span>
  );
}
