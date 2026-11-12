import Image from "next/image";

/**
 * HumanIQ mark. The "H" is white, so on a light background pass `tile` to sit the
 * logo on a navy rounded square; on the dark sidebar and blue panels use it bare.
 */
export function Logo({ size = 40, tile = false, className = "" }: { size?: number; tile?: boolean; className?: string }) {
  if (tile) {
    const pad = Math.round(size * 0.1);
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-[22%] bg-[#0e2358] ${className}`}
        style={{ width: size, height: size, padding: pad }}
      >
        <Image src="/logo.png" alt="HumanIQ" width={size} height={size} priority className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <Image
      src="/logo.png"
      alt="HumanIQ"
      width={size}
      height={size}
      priority
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
