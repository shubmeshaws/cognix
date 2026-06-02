"use client";

import { useState } from "react";

import { Panel } from "@/components/dashboard/Panel";
import { Terminal } from "@/components/Terminal";
import { TerminalModal } from "@/components/TerminalModal";

export function AgentTerminal() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Panel
        title="AI agent terminal"
        viewAllPrompt="Open full agent terminal stream"
        onViewAll={() => setModalOpen(true)}
        fillContent
        className="flex h-full min-h-0 min-w-0 flex-col"
      >
        <Terminal
          live
          fillViewport
          showScrollControls
          className="h-full min-h-0 flex-1"
        />
      </Panel>

      <TerminalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="AI agent terminal"
        live
      />
    </>
  );
}
