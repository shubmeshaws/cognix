import { CheckCircle2, Loader2, ShieldAlert, SkipForward, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type PodActionBadgeVariant =
  | "approval"
  | "healing"
  | "healed"
  | "skipped"
  | "failed"
  | "neutral";

const VARIANTS: Record<
  PodActionBadgeVariant,
  { label: string; icon?: LucideIcon; className: string; iconClassName?: string }
> = {
  approval: {
    label: "Approve",
    icon: ShieldAlert,
    className:
      "border-amber-500/50 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-950 shadow-sm ring-1 ring-amber-500/25 dark:from-amber-950/80 dark:to-orange-950/40 dark:text-amber-100 dark:ring-amber-400/20",
    iconClassName: "text-amber-600 dark:text-amber-400",
  },
  healing: {
    label: "Healing",
    icon: Loader2,
    className:
      "border-violet-500/35 bg-violet-50 text-violet-900 ring-1 ring-violet-500/15 dark:bg-violet-950/50 dark:text-violet-200",
    iconClassName: "animate-spin text-violet-600 dark:text-violet-400",
  },
  healed: {
    label: "Healed",
    icon: CheckCircle2,
    className:
      "border-emerald-500/35 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/15 dark:bg-emerald-950/50 dark:text-emerald-300",
    iconClassName: "text-emerald-600 dark:text-emerald-400",
  },
  skipped: {
    label: "Skipped",
    icon: SkipForward,
    className: "border-border bg-muted/60 text-muted-foreground",
    iconClassName: "text-muted-foreground",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className:
      "border-red-500/35 bg-red-50 text-red-800 ring-1 ring-red-500/15 dark:bg-red-950/50 dark:text-red-300",
    iconClassName: "text-red-600 dark:text-red-400",
  },
  neutral: {
    label: "",
    className: "border-border bg-secondary text-secondary-foreground",
  },
};

export function PodActionBadge({
  variant,
  label,
  className,
}: {
  variant: PodActionBadgeVariant;
  label?: string;
  className?: string;
}) {
  const config = VARIANTS[variant];
  const text = label?.trim() || config.label;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold leading-tight tracking-wide",
        config.className,
        className,
      )}
    >
      {variant === "approval" ? (
        <span
          className="relative flex h-1.5 w-1.5 shrink-0"
          aria-hidden
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
      ) : null}
      {Icon ? (
        <Icon
          className={cn("h-3 w-3 shrink-0", config.iconClassName)}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{text}</span>
    </span>
  );
}
