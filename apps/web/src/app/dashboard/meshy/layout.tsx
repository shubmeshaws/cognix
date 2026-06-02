"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/meshy", label: "Meshy", icon: Sparkles, exact: true },
  {
    href: "/dashboard/meshy/alerts",
    label: "Voice alerts",
    icon: Mic,
    exact: false,
  },
] as const;

export default function MeshyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b bg-card/80 px-5 pt-2">
        <div className="mb-2">
          <p className="text-2xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
            MeshyAI
          </p>
        </div>
        <nav className="-mb-px flex gap-1">
          {TABS.map(({ href, label, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
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
