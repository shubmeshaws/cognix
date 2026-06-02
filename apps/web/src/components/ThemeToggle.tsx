"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useTheme();

  return (
    <div
      className="flex items-center rounded-md border bg-muted/40 p-0.5"
      role="group"
      aria-label="Theme"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 gap-1.5 px-2.5",
          mounted && theme === "light" && "bg-background shadow-sm",
        )}
        disabled={!mounted}
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        <Sun className="h-3.5 w-3.5" />
        <span className="text-xs">Light</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 gap-1.5 px-2.5",
          mounted && theme === "dark" && "bg-background shadow-sm",
        )}
        disabled={!mounted}
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        <Moon className="h-3.5 w-3.5" />
        <span className="text-xs">Dark</span>
      </Button>
    </div>
  );
}
