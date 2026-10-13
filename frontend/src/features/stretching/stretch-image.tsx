import { useEffect, useState } from "react";

import { getStretchImage } from "./stretching-api";

type Props = {
  src: string;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  width?: number;
  height?: number;
};

export function StretchImage({
  src,
  alt,
  className,
  loading,
  width,
  height,
}: Props) {
  const [resolvedImage, setResolvedImage] = useState<{
    source: string;
    objectUrl: string;
  } | null>(null);

  useEffect(() => {
    if (!src.startsWith("/api/v1/stretching/")) return;

    let active = true;
    let objectUrl: string | null = null;
    void getStretchImage(src)
      .then((image) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(image);
        setResolvedImage({ source: src, objectUrl });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const displaySrc = src.startsWith("/api/v1/stretching/")
    ? resolvedImage?.source === src
      ? resolvedImage.objectUrl
      : null
    : src;
  if (!displaySrc) return null;
  return (
    <img
      className={className}
      src={displaySrc}
      alt={alt}
      loading={loading}
      width={width}
      height={height}
    />
  );
}
