"use client";

import type { ReactNode } from "react";

import { InfoTooltip } from "@/components/InfoTooltip";
import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  description,
  tooltip,
  icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  tooltip?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-6 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        {icon}
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          {tooltip ? <InfoTooltip content={tooltip} /> : null}
        </div>
      </div>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
