import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  /** Default Ollama base URL — override in Settings → Agent → Apply. */
  OLLAMA_URL: z.string().url(),
  /** Fallback API keys — prefer Settings → Agent (persisted to .kubehealer/llm-config.json). */
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  PUTER_AUTH_TOKEN: z.string().optional(),
  PUTER_APP_ORIGIN: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.string().optional(),
  MAX_MEMORY_LIMIT: z.string().default("4Gi"),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  PAGERDUTY_INTEGRATION_KEY: z.string().optional(),
  ALLOW_LOCAL_KUBECONFIG: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

function stripEmpty(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...source };
  for (const key of Object.keys(out)) {
    if (out[key] === "") delete out[key];
  }
  return out;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(stripEmpty(source));
}
