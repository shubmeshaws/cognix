import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { normalizeLlmChain, type LlmProviderChain } from "@kubehealer/shared";

import {
  getLlmRuntime,
  setLlmRuntime,
  type LlmRuntimeOverrides,
} from "./llm-runtime.js";

export interface LlmConfigFile {
  llmChain?: LlmProviderChain;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  puterAuthToken?: string;
  puterModel?: string;
  puterAppOrigin?: string;
}

const DEFAULT_PATH = join(process.cwd(), ".kubehealer", "llm-config.json");

function configPath(): string {
  return process.env.LLM_CONFIG_PATH?.trim() || DEFAULT_PATH;
}

function fileToOverrides(data: LlmConfigFile): LlmRuntimeOverrides {
  const patch: LlmRuntimeOverrides = {};
  if (data.llmChain !== undefined) {
    patch.llmChain = normalizeLlmChain(data.llmChain);
  }
  if (data.ollamaUrl?.trim()) patch.ollamaUrl = data.ollamaUrl.trim();
  if (data.ollamaModel?.trim()) patch.ollamaModel = data.ollamaModel.trim();
  if (data.openaiApiKey?.trim()) patch.openaiApiKey = data.openaiApiKey.trim();
  if (data.openaiModel?.trim()) patch.openaiModel = data.openaiModel.trim();
  if (data.anthropicApiKey?.trim()) {
    patch.anthropicApiKey = data.anthropicApiKey.trim();
  }
  if (data.anthropicModel?.trim()) {
    patch.anthropicModel = data.anthropicModel.trim();
  }
  if (data.puterAuthToken?.trim()) {
    patch.puterAuthToken = data.puterAuthToken.trim();
  }
  if (data.puterModel?.trim()) patch.puterModel = data.puterModel.trim();
  if (data.puterAppOrigin?.trim()) {
    patch.puterAppOrigin = data.puterAppOrigin.trim();
  }
  return patch;
}

function runtimeToFile(): LlmConfigFile {
  const rt = getLlmRuntime();
  const file: LlmConfigFile = {};
  if (rt.llmChain !== undefined) {
    file.llmChain = normalizeLlmChain(rt.llmChain);
  }
  if (rt.ollamaUrl?.trim()) file.ollamaUrl = rt.ollamaUrl.trim();
  if (rt.ollamaModel?.trim()) file.ollamaModel = rt.ollamaModel.trim();
  if (rt.openaiApiKey?.trim()) file.openaiApiKey = rt.openaiApiKey.trim();
  if (rt.openaiModel?.trim()) file.openaiModel = rt.openaiModel.trim();
  if (rt.anthropicApiKey?.trim()) {
    file.anthropicApiKey = rt.anthropicApiKey.trim();
  }
  if (rt.anthropicModel?.trim()) {
    file.anthropicModel = rt.anthropicModel.trim();
  }
  if (rt.puterAuthToken?.trim()) {
    file.puterAuthToken = rt.puterAuthToken.trim();
  }
  if (rt.puterModel?.trim()) file.puterModel = rt.puterModel.trim();
  if (rt.puterAppOrigin?.trim()) {
    file.puterAppOrigin = rt.puterAppOrigin.trim();
  }
  return file;
}

export async function loadLlmConfigFromDisk(): Promise<void> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    const data = JSON.parse(raw) as LlmConfigFile;
    const patch = fileToOverrides(data);
    if (Object.keys(patch).length > 0) {
      setLlmRuntime(patch);
    }
  } catch {
    // No LLM config file yet — configure in Settings → Apply
  }
}

export async function saveLlmConfigToDisk(): Promise<void> {
  const file = runtimeToFile();
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
}
