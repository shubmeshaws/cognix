/** Build full transcript from Web Speech API result list. */
export function transcriptFromResults(
  results: SpeechRecognitionResultList,
  fromIndex = 0,
): string {
  let text = "";
  for (let i = fromIndex; i < results.length; i++) {
    text += results[i]?.[0]?.transcript ?? "";
  }
  return text.replace(/\s+/g, " ").trim();
}

export interface VoiceTranscriptParts {
  /** Committed words — stable left-to-right text. */
  finalized: string;
  /** In-progress tail — updates as the user keeps speaking. */
  interim: string;
  /** Full display string (finalized + interim). */
  full: string;
}

/** Merge finalized + interim segments for streaming left-to-right display. */
export function mergeTranscriptPartsFrom(
  results: SpeechRecognitionResultList,
  startIndex = 0,
): VoiceTranscriptParts {
  const finals: string[] = [];
  let interim = "";

  for (let i = startIndex; i < results.length; i++) {
    const part = String(results[i]?.[0]?.transcript ?? "").trim();
    if (!part) continue;
    if (results[i].isFinal) {
      finals.push(part);
      interim = "";
    } else {
      interim = part;
    }
  }

  const finalized = finals.join(" ").replace(/\s+/g, " ").trim();
  const full = [finalized, interim]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return { finalized, interim, full };
}

/** Merge finalized segments plus latest interim hypothesis from an index. */
export function mergeTranscriptResultsFrom(
  results: SpeechRecognitionResultList,
  startIndex = 0,
): string {
  return mergeTranscriptPartsFrom(results, startIndex).full;
}

/** Merge finalized segments plus latest interim hypothesis. */
export function mergeTranscriptResults(
  results: SpeechRecognitionResultList,
): string {
  return mergeTranscriptResultsFrom(results, 0);
}
