"use client";

import { useEffect } from "react";

import { useSettingsStore } from "@/stores/settings";

export function SettingsHydrate() {
  const hydrate = useSettingsStore((s) => s.hydrate);
  const hydrated = useSettingsStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  return null;
}
