import { cn } from "@/lib/utils";

export type PodStatusVariant = "running" | "warn" | "error" | "healing";

const styles: Record<PodStatusVariant, string> = {
  running: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  healing: "bg-purple-500 animate-pulse",
};

export function StatusDot({
  variant,
  className,
}: {
  variant: PodStatusVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full",
        styles[variant],
        className,
      )}
      aria-hidden
    />
  );
}

export function podStatusVariant(
  pod: {
    phase: string;
    issueType: string | null;
    hasActiveHeal: boolean;
  },
  heal?: { status?: string } | null,
): PodStatusVariant {
  if (heal?.status === "pending") {
    if (pod.issueType) {
      const critical = [
        "CrashLoop",
        "OOM",
        "ImagePull",
        "NodePressure",
        "MultiVolumeAttachment",
      ];
      return critical.includes(pod.issueType) ? "error" : "warn";
    }
    return "warn";
  }
  if (pod.hasActiveHeal) return "healing";
  if (pod.issueType) {
    const critical = [
      "CrashLoop",
      "OOM",
      "ImagePull",
      "NodePressure",
      "MultiVolumeAttachment",
    ];
    return critical.includes(pod.issueType) ? "error" : "warn";
  }
  if (pod.phase === "Running" || pod.phase === "Succeeded") return "running";
  if (pod.phase === "Pending") return "warn";
  return "error";
}
