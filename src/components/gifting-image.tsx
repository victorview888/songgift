import { giftingScenes, type GiftingScene } from "@/lib/gifting-imagery";

export function GiftingImage({ scene, className = "", sizes, priority = false, decorative = false }: {
  scene: GiftingScene; className?: string; sizes: string; priority?: boolean; decorative?: boolean;
}) {
  const details = giftingScenes[scene];
  // Prebuilt responsive WebP files work on both Next and Workers without a runtime image service.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`gifting-image ${className}`} src={`/images/gifting/${scene}-960.webp`}
    srcSet={[480, 960, 1440].map(width => `/images/gifting/${scene}-${width}.webp ${width}w`).join(", ")}
    sizes={sizes} width={1440} height={"height" in details ? details.height : 960} alt={decorative ? "" : details.alt}
    loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
    style={{ objectPosition: details.position }} />;
}
