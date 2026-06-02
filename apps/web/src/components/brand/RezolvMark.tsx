import Image from "next/image";

import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/rezolv-mark.png";

/** REZOLV brand mark (robot icon). */
export function RezolvMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Image
      src={MARK_SRC}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
      aria-hidden
    />
  );
}
