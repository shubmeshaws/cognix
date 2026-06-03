"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  MessageSquare,
  Mic,
  Sparkles,
} from "lucide-react";

import { SettingsHydrate } from "@/components/settings/SettingsHydrate";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/dashboard/settings",
    label: "Meshy",
    icon: Sparkles,
    exact: true,
  },
  {
    href: "/dashboard/settings/voice",
    label: "Voice alerts",
    icon: Mic,
    exact: false,
  },
  {
    href: "/dashboard/settings/agent",
    label: "Agent",
    icon: Bot,
    exact: false,
  },
  {
    href: "/dashboard/settings/integrations",
    label: "Integrations",
    icon: MessageSquare,
    exact: false,
  },
] as const;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHydrate />
      <div className="border-b bg-card/80 px-5 pt-2">
        <div className="mb-2">
          <p className="text-2xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            Settings
          </p>
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map(({ href, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
