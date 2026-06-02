import { cn } from "@/lib/utils";

import { RezolvMark } from "./RezolvMark";

const DEFAULT_TAGLINE = "AI healing agent";

type RezolvLogoProps = {
  className?: string;
  /** Mark size in px */
  markSize?: number;
  /** Show sub-branding tagline below the name */
  showTagline?: boolean;
  tagline?: string;
  /** `sidebar` compact stack; `inline` horizontal; `hero` large landing */
  variant?: "sidebar" | "inline" | "hero";
};

export function RezolvLogo({
  className,
  markSize,
  showTagline = false,
  tagline = DEFAULT_TAGLINE,
  variant = "inline",
}: RezolvLogoProps) {
  const size =
    markSize ?? (variant === "hero" ? 70 : variant === "sidebar" ? 32 : 34);

  if (variant === "hero") {
    return (
      <div className={cn("flex flex-col items-center gap-3.5", className)}>
        <RezolvMark size={size} />
        <div className="text-center">
          <p className="font-brand text-9xl tracking-[0.14em] text-foreground sm:text-9xl leading-none">
            REZOLV
          </p>
          {showTagline ? (
            <p className="font-brand-sub mt-0.5 text-2xs text-muted-foreground">
              {tagline}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        <RezolvMark size={size} />
        <div className="min-w-0">
          <p className="font-brand text-3xl leading-none tracking-[0.15em] text-foreground">
            REZOLV
          </p>
          {/* {showTagline ? (
            <p className="font-brand-sub mt-1 text-[8px] text-muted-foreground">
              {tagline}
            </p>
          ) : null} */}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <RezolvMark size={size} />
      <div className="min-w-0">
        <p className="font-brand text-3xl leading-none tracking-[0.12em] text-foreground">
          REZOLV
        </p>
        {showTagline ? (
          <p className="font-brand-sub mt-0.5 text-[8px] text-muted-foreground">{tagline}</p>
        ) : null}
      </div>
    </div>
  );
}
