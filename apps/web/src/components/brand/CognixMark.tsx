import { cn } from "@/lib/utils";

/** Cognix brand mark — modern robotic icon with subtle motion. */
export function CognixMark({
  className,
  size = 32,
  animated = true,
}: {
  className?: string;
  size?: number;
  animated?: boolean;
}) {
  const id = `cognix-${size}`;

  const svg = (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden
      className={cn(
        animated ? "cognix-mark__svg" : "shrink-0",
        !animated && className,
      )}
    >
      <defs>
        <linearGradient
          id={`${id}-grad`}
          x1="6"
          y1="4"
          x2="34"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient
          id={`${id}-sheen`}
          x1="0"
          y1="0"
          x2="40"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-visor-clip`}>
          <rect x="13.5" y="16" width="13" height="5.5" rx="2.5" />
        </clipPath>
      </defs>

      {/* Orbital ring */}
      <circle
        cx="20"
        cy="20"
        r="16.5"
        fill="none"
        stroke={`url(#${id}-grad)`}
        strokeWidth="0.8"
        strokeDasharray="3 5"
        opacity="0.45"
        className={animated ? "cognix-mark__orbit" : undefined}
      />

      {/* Antenna */}
      <g className={animated ? "cognix-mark__antenna" : undefined}>
        <path
          d="M20 12.5V7.5"
          stroke={`url(#${id}-grad)`}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="20" cy="6.5" r="1.6" fill="#06b6d4" />
        <circle
          cx="20"
          cy="6.5"
          r="3.2"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="0.8"
          opacity="0.55"
          className={animated ? "cognix-mark__antenna-ping" : undefined}
        />
      </g>

      {/* Head */}
      <rect
        x="11"
        y="12"
        width="18"
        height="16"
        rx="6"
        fill="rgba(15, 23, 42, 0.55)"
        stroke={`url(#${id}-grad)`}
        strokeWidth="1.4"
        className={animated ? "cognix-mark__head" : undefined}
      />

      {/* Visor */}
      <rect
        x="13.5"
        y="16"
        width="13"
        height="5.5"
        rx="2.5"
        fill="#020617"
        opacity="0.92"
      />
      <rect
        x="13.5"
        y="16"
        width="13"
        height="5.5"
        rx="2.5"
        fill="none"
        stroke={`url(#${id}-grad)`}
        strokeWidth="0.8"
        opacity="0.8"
      />
      <g clipPath={`url(#${id}-visor-clip`}>
        <rect
          x="8"
          y="16"
          width="8"
          height="5.5"
          fill={`url(#${id}-sheen)`}
          className={animated ? "cognix-mark__scan" : undefined}
        />
      </g>

      {/* Eyes */}
      <circle
        cx="16.5"
        cy="24.5"
        r="1.35"
        fill="#22d3ee"
        className={animated ? "cognix-mark__eye cognix-mark__eye--left" : undefined}
      />
      <circle
        cx="23.5"
        cy="24.5"
        r="1.35"
        fill="#22d3ee"
        className={animated ? "cognix-mark__eye cognix-mark__eye--right" : undefined}
      />
      <circle cx="16.8" cy="24.2" r="0.4" fill="#ecfeff" opacity="0.95" />
      <circle cx="23.8" cy="24.2" r="0.4" fill="#ecfeff" opacity="0.95" />

      {/* Mouth line */}
      <path
        d="M16 28.5H24"
        stroke={`url(#${id}-grad)`}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Shoulder accent */}
      <path
        d="M13 31.5H27"
        stroke={`url(#${id}-grad)`}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );

  if (!animated) return svg;

  return (
    <span className={cn("cognix-mark", className)} style={{ width: size, height: size }}>
      <span aria-hidden className="cognix-mark__halo" />
      {svg}
    </span>
  );
}
