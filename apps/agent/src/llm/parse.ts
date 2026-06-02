import { diagnosisSchema, type PodDiagnosis } from "./types.js";

export function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return JSON.parse(fenceMatch[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error("No JSON object found in LLM response");
}

export function parseDiagnosis(text: string): PodDiagnosis {
  const raw = extractJsonPayload(text);
  return diagnosisSchema.parse(raw);
}
