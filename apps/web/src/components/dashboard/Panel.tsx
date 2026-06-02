import { Button } from "@/components/ui/button";
import { sendPrompt } from "@/lib/sendPrompt";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  viewAllPrompt,
  onViewAll,
  className,
  fillContent = false,
  children,
}: {
  title: string;
  viewAllPrompt: string;
  onViewAll?: () => void;
  className?: string;
  /** Let body grow to fill panel height (used with grid row stretch) */
  fillContent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => {
            if (onViewAll) onViewAll();
            else sendPrompt(viewAllPrompt);
          }}
        >
          View all ↗
        </Button>
      </header>
      <div
        className={cn(
          "overflow-hidden",
          fillContent && "flex min-h-0 flex-1 flex-col",
        )}
      >
        {children}
      </div>
    </section>
  );
}
