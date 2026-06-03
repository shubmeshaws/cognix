"use client";

import { SetupHealthPanel } from "@/components/setup/SetupHealthPanel";

export default function SetupPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 p-5 md:p-6">
        <SetupHealthPanel />
      </div>
    </div>
  );
}
