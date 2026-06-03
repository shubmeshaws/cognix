"use client";

import { SsoProviderLogo } from "@/components/auth/SsoProviderLogos";
import type { SsoProviderId } from "@/types/api";
import { cn } from "@/lib/utils";

const SSO_STYLES: Record<
  SsoProviderId,
  {
    label: string;
    buttonClass: string;
    iconWrapClass: string;
    logoClass?: string;
  }
> = {
  google: {
    label: "Continue with Google",
    buttonClass:
      "border border-[#dadce0] bg-white text-[#3c4043] shadow-sm hover:bg-[#f8f9fa] hover:shadow-md focus-visible:ring-[#4285F4]/40 dark:border-[#5f6368] dark:bg-[#131314] dark:text-[#e8eaed] dark:hover:bg-[#1f1f1f]",
    iconWrapClass: "bg-white ring-1 ring-[#dadce0] dark:bg-white dark:ring-0",
  },
  github: {
    label: "Continue with GitHub",
    buttonClass:
      "border border-[#24292f] bg-[#24292f] text-white shadow-sm hover:bg-[#32383f] hover:shadow-md focus-visible:ring-[#24292f]/50",
    iconWrapClass: "bg-[#24292f] text-white",
    logoClass: "text-white",
  },
  linkedin: {
    label: "Continue with LinkedIn",
    buttonClass:
      "border border-[#0a66c2] bg-[#0a66c2] text-white shadow-sm hover:bg-[#004182] hover:shadow-md focus-visible:ring-[#0a66c2]/50",
    iconWrapClass: "bg-[#0a66c2] text-white",
    logoClass: "text-white",
  },
};

export function SsoLoginButton({
  provider,
  onSignIn,
}: {
  provider: SsoProviderId;
  onSignIn: () => Promise<void>;
}) {
  const style = SSO_STYLES[provider];

  return (
    <form action={onSignIn} className="w-full">
      <button
        type="submit"
        className={cn(
          "group grid h-12 w-full grid-cols-[2.25rem_1fr_2.25rem] items-center rounded-lg px-3 text-sm font-semibold transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          style.buttonClass,
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            style.iconWrapClass,
          )}
        >
          <SsoProviderLogo provider={provider} className={style.logoClass} />
        </span>
        <span className="text-center">{style.label}</span>
        <span aria-hidden className="h-8 w-8" />
      </button>
    </form>
  );
}

export function SsoLoginButtons({
  providers,
  signInHandlers,
}: {
  providers: SsoProviderId[];
  signInHandlers: Record<
    SsoProviderId,
    () => Promise<void>
  >;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Or continue with
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-col gap-3">
        {providers.map((id) => (
          <SsoLoginButton
            key={id}
            provider={id}
            onSignIn={signInHandlers[id]}
          />
        ))}
      </div>
    </div>
  );
}
