"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

const COMMAND_PREFIX =
  /^(kubectl|helm|k9s|docker|nerdctl|minikube|kind|curl|bash|sh|zsh|export|source)\b/i;

function isCopyableCommand(text: string): boolean {
  const trimmed = text.trim();
  return COMMAND_PREFIX.test(trimmed) || trimmed.includes(" kubectl ");
}

function CopyButton({
  text,
  className,
  label = "Copy",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copied ? "Copied!" : label}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold transition-colors",
        copied
          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          : "bg-white/10 text-inherit hover:bg-white/20",
        className,
      )}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({
  code,
  language,
  variant,
}: {
  code: string;
  language?: string;
  variant: "assistant" | "user";
}) {
  const trimmed = code.trimEnd();
  const isCommand = isCopyableCommand(trimmed) || language === "bash" || language === "sh";

  return (
    <div
      className={cn(
        "group relative my-2.5 overflow-hidden rounded-lg border font-mono text-xs shadow-sm",
        variant === "assistant"
          ? "border-violet-500/30 bg-zinc-950 text-emerald-100"
          : "border-primary-foreground/20 bg-black/25 text-primary-foreground",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide",
          variant === "assistant"
            ? "border-violet-500/20 bg-violet-950/80 text-violet-300"
            : "border-primary-foreground/15 bg-black/20 text-primary-foreground/80",
        )}
      >
        <span>{language || (isCommand ? "command" : "code")}</span>
        <CopyButton
          text={trimmed}
          label="Copy command"
          className={
            variant === "user"
              ? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
              : undefined
          }
        />
      </div>
      <pre className="overflow-x-auto p-3 leading-relaxed">
        <code>{trimmed}</code>
      </pre>
    </div>
  );
}

function InlineCode({
  code,
  variant,
}: {
  code: string;
  variant: "assistant" | "user";
}) {
  const showCopy = isCopyableCommand(code);

  if (!showCopy) {
    return (
      <code
        className={cn(
          "rounded px-1.5 py-0.5 font-mono text-[0.85em] font-medium",
          variant === "assistant"
            ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
            : "bg-primary-foreground/15 text-primary-foreground",
        )}
      >
        {code}
      </code>
    );
  }

  return (
    <span className="group/code relative inline-flex max-w-full items-center gap-1 align-middle">
      <code
        className={cn(
          "rounded-md px-2 py-0.5 font-mono text-[0.85em] font-medium",
          variant === "assistant"
            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground",
        )}
      >
        {code}
      </code>
      <CopyButton
        text={code}
        label="Copy command"
        className={cn(
          "shrink-0 opacity-80 group-hover/code:opacity-100",
          variant === "user" && "bg-primary-foreground/10 hover:bg-primary-foreground/20",
        )}
      />
    </span>
  );
}

function parseInline(text: string, variant: "assistant" | "user", keyPrefix: string): ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-inline-${i++}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong
          key={key}
          className={cn(
            "font-bold",
            variant === "assistant"
              ? "text-violet-700 dark:text-violet-300"
              : "text-primary-foreground",
          )}
        >
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (
      (token.startsWith("*") && token.endsWith("*")) ||
      (token.startsWith("_") && token.endsWith("_"))
    ) {
      nodes.push(
        <em
          key={key}
          className={cn(
            "italic",
            variant === "assistant" ? "text-foreground/90" : "text-primary-foreground/90",
          )}
        >
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <InlineCode key={key} code={token.slice(1, -1)} variant={variant} />,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const isInternal = href.startsWith("/");
        const linkClass = cn(
          "font-semibold underline underline-offset-2 transition-colors",
          variant === "assistant"
            ? "text-violet-600 hover:text-violet-500 dark:text-violet-400"
            : "text-primary-foreground hover:opacity-80",
        );
        nodes.push(
          isInternal ? (
            <Link key={key} href={href} className={linkClass}>
              {label}
            </Link>
          ) : (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {label}
            </a>
          ),
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function toneClass(line: string, variant: "assistant" | "user"): string | null {
  const trimmed = line.trim();
  if (/^⚠️|^warning:/i.test(trimmed)) {
    return variant === "assistant"
      ? "rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-800 dark:text-amber-200"
      : "rounded-md bg-primary-foreground/10 px-2.5 py-1.5";
  }
  if (/^✅|^success:/i.test(trimmed)) {
    return variant === "assistant"
      ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-800 dark:text-emerald-200"
      : "rounded-md bg-primary-foreground/10 px-2.5 py-1.5";
  }
  if (/^❌|^error:/i.test(trimmed) || /\*\*error\*\*/i.test(trimmed)) {
    return variant === "assistant"
      ? "rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-red-800 dark:text-red-200"
      : "rounded-md bg-primary-foreground/10 px-2.5 py-1.5";
  }
  if (/^ℹ️|^info:/i.test(trimmed)) {
    return variant === "assistant"
      ? "rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-sky-800 dark:text-sky-200"
      : "rounded-md bg-primary-foreground/10 px-2.5 py-1.5";
  }
  return null;
}

function parseBlocks(content: string, variant: "assistant" | "user"): ReactNode[] {
  const blocks: ReactNode[] = [];
  const fenceRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  const pushTextBlock = (text: string) => {
    if (!text.trim()) return;

    const lines = text.split("\n");
    let listBuffer: string[] = [];

    const flushList = () => {
      if (listBuffer.length === 0) return;
      blocks.push(
        <ul
          key={`list-${blockIndex++}`}
          className={cn(
            "my-2 list-none space-y-1.5 pl-0",
            variant === "assistant" ? "text-foreground" : "text-primary-foreground",
          )}
        >
          {listBuffer.map((item, idx) => (
            <li key={idx} className="flex gap-2 leading-relaxed">
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  variant === "assistant" ? "bg-violet-500" : "bg-primary-foreground/80",
                )}
              />
              <span>{parseInline(item, variant, `li-${blockIndex}-${idx}`)}</span>
            </li>
          ))}
        </ul>,
      );
      listBuffer = [];
    };

    for (const line of lines) {
      const bulletMatch = /^[-*•]\s+(.+)$/.exec(line.trim());
      if (bulletMatch) {
        listBuffer.push(bulletMatch[1]);
        continue;
      }

      flushList();

      if (!line.trim()) {
        blocks.push(<div key={`sp-${blockIndex++}`} className="h-2" />);
        continue;
      }

      const tone = toneClass(line, variant);
      blocks.push(
        <p
          key={`p-${blockIndex++}`}
          className={cn("leading-relaxed", tone ?? undefined)}
        >
          {parseInline(line, variant, `p-${blockIndex}`)}
        </p>,
      );
    }

    flushList();
  };

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      pushTextBlock(content.slice(lastIndex, match.index));
    }
    blocks.push(
      <CodeBlock
        key={`code-${blockIndex++}`}
        language={match[1] || undefined}
        code={match[2]}
        variant={variant}
      />,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    pushTextBlock(content.slice(lastIndex));
  }

  return blocks;
}

export function MeshyMessageContent({
  content,
  variant = "assistant",
  className,
}: {
  content: string;
  variant?: "assistant" | "user";
  className?: string;
}) {
  return (
    <div className={cn("meshy-message space-y-1 text-sm leading-relaxed", className)}>
      {parseBlocks(content, variant)}
    </div>
  );
}
