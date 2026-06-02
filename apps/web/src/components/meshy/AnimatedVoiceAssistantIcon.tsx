"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

const VOICE_ASSISTANT_ICON = "/brand/voice-assistant.png";

/** Animated Icons8 voice assistant icon. */
export function AnimatedVoiceAssistantIcon({
  size = 32,
  active = false,
  listening = false,
  className,
}: {
  size?: number;
  active?: boolean;
  listening?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "meshy-voice-icon relative inline-flex shrink-0 items-center justify-center",
        active && "meshy-voice-icon--active",
        listening && "meshy-voice-icon--listening",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {active && (
        <>
          <span className="meshy-voice-icon__ring meshy-voice-icon__ring-1" />
          <span className="meshy-voice-icon__ring meshy-voice-icon__ring-2" />
        </>
      )}
      <Image
        src={VOICE_ASSISTANT_ICON}
        alt=""
        width={size}
        height={size}
        className="meshy-voice-icon__img relative z-10 object-contain"
        draggable={false}
        priority={size >= 40}
      />
    </span>
  );
}
