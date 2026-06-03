"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, HardDrive, Layers, Server, ShieldCheck, SlidersHorizontal } from "lucide-react";

import {
  HealRulesProvider,
} from "@/components/rules/HealRulesProvider";
import { HealRulesSaveBar } from "@/components/rules/HealRulesSaveBar";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/dashboard/rules",
    label: "Pods",
    icon: Box,
    exact: true,
  },
  {
    href: "/dashboard/rules/nodes",
    label: "Nodes",
    icon: Server,
    exact: false,
  },
  {
    href: "/dashboard/rules/pvc",
    label: "PVC",
    icon: HardDrive,
    exact: false,
  },
  {
    href: "/dashboard/rules/addons",
    label: "Addons",
    icon: Layers,
    exact: false,
  },
  {
    href: "/dashboard/rules/general",
    label: "General",
    icon: SlidersHorizontal,
    exact: false,
  },
] as const;

export default function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <HealRulesProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b bg-card/80 px-5 pt-2">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <p className="text-2xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Rules
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

        <div className="flex-1">{children}</div>
        <HealRulesSaveBar />
      </div>
    </HealRulesProvider>
  );
}
