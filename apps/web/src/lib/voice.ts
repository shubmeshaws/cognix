/** Plain text for TTS — strips markdown/symbols that engines spell letter-by-letter. */

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
] as const;

const LONG_NUMBER_MIN_DIGITS = 5;

/** Read 56765 as "five six seven six five", not "fifty-six thousand…". */
export function spellLongNumbersForSpeech(
  text: string,
  minDigits = LONG_NUMBER_MIN_DIGITS,
): string {
  if (minDigits < 2) minDigits = 2;

  return text.replace(
    new RegExp(`\\b\\d{${minDigits},}\\b`, "g"),
    (match) =>
      match
        .split("")
        .map((digit) => DIGIT_WORDS[Number(digit)] ?? digit)
        .join(" "),
  );
}

export function cleanTextForSpeech(text: string): string {
  return spellLongNumbersForSpeech(
    text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^[\s]*[-*•]\s+/gm, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, "")
      .replace(/[⚠️✅❌⚡✨🎤📋🔍ℹ️→•|]/g, " ")
      .replace(/[*_`#\\[\]{}<>]/g, " ")
      .replace(/\n+/g, ". ")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

const DEFAULT_MAX_VOICE_CHARS = 700;

/** Plain speech text — full sentences up to maxChars for voice playback. */
export function summarizeForVoice(
  text: string,
  maxChars = DEFAULT_MAX_VOICE_CHARS,
): string {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [cleaned];
  let result = "";
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    const next = result ? `${result} ${piece}` : piece;
    if (next.length > maxChars) break;
    result = next;
  }

  if (result.length >= 40) {
    return result.replace(/\s+/g, " ").trim();
  }

  const cut = cleaned.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > 30 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed}. See the chat for the full answer.`;
}
