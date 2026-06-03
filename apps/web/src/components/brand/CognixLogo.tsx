import { cn } from "@/lib/utils";

import { CognixMark } from "./CognixMark";

const DEFAULT_TAGLINE = "AI healing agent";

type CognixLogoProps = {
  className?: string;
  /** Mark size in px */
  markSize?: number;
  /** Show sub-branding tagline below the name */
  showTagline?: boolean;
  tagline?: string;
  /** `sidebar` compact stack; `inline` horizontal; `hero` large landing */
  variant?: "sidebar" | "inline" | "hero";
};

export function CognixLogo({
  className,
  markSize,
  showTagline = false,
  tagline = DEFAULT_TAGLINE,
  variant = "inline",
}: CognixLogoProps) {
  const size =
    markSize ?? (variant === "hero" ? 88 : variant === "sidebar" ? 44 : 42);

  if (variant === "hero") {
    return (
      <div className={cn("flex flex-col items-center gap-4", className)}>
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden
            className="cognix-logo-hero-glow absolute inset-0 scale-150 rounded-full bg-violet-500/25 blur-3xl dark:bg-violet-400/20"
          />
          <CognixMark size={size} className="relative" animated />
        </div>
        <div className="text-center">
          <p className="font-brand text-8xl leading-none text-foreground sm:text-9xl">
            Cognix
          </p>
          {showTagline ? (
            <p className="font-brand-sub mt-2 text-2xs text-muted-foreground">
              {tagline}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "sidebar") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <CognixMark size={size} className="translate-x-[3px]" />
        <div className="min-w-0 translate-y-[3px]">
          <p className="font-brand text-[2.25rem] leading-[0.9] text-foreground">
            Cognix
          </p>
          {showTagline ? (
            <p className="font-brand-sub mt-0.5 text-[8px] leading-tight text-muted-foreground">
              {tagline}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <CognixMark size={size} className="translate-x-[3px]" />
      <div className="min-w-0 translate-y-[3px]">
        <p className="font-brand text-[2.25rem] leading-none text-foreground">
          Cognix
        </p>
        {showTagline ? (
          <p className="font-brand-sub mt-0.5 text-[9px] text-muted-foreground">
            {tagline}
          </p>
        ) : null}
      </div>
    </div>
  );
}
