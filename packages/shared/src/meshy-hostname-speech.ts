/** Speak Kubernetes node hostnames clearly for TTS (EC2 / EKS style). */

const TOKEN_PRONUNCIATION: Record<string, string> = {
  ip: "eyepee",
  ap: "ayepee",
};

const ONES = [
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

const TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

function numberToSpeech(numStr: string): string {
  const n = parseInt(numStr, 10);
  if (Number.isNaN(n)) return numStr;
  if (n < 10) return ONES[n]!;
  if (n < 20) return TEENS[n - 10]!;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (ones === 0) return TENS[tens]!;
    return `${TENS[tens]}${ONES[ones]}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const prefix = `${ONES[hundreds]}hundred`;
    if (rest === 0) return prefix;
    return `${ONES[hundreds]}${numberToSpeech(String(rest))}`;
  }
  return numStr
    .split("")
    .map((digit) => ONES[Number(digit)] ?? digit)
    .join("");
}

function speakSegment(segment: string): string {
  const lower = segment.toLowerCase();
  if (TOKEN_PRONUNCIATION[lower]) return TOKEN_PRONUNCIATION[lower]!;
  if (/^\d+$/.test(segment)) return numberToSpeech(segment);
  return lower;
}

/** e.g. ip-10-1-100-156.ap-south-1.compute.internal → eyepee ten one onehundred onefiftysix dot ayepee south one dot compute dot internal */
export function formatHostnameForSpeech(hostname: string): string {
  const cleaned = hostname.replace(/^\/+|\/+.*$/g, "").trim();
  if (!cleaned) return "";

  const dotParts = cleaned.split(".").filter(Boolean);
  const spoken: string[] = [];

  for (let i = 0; i < dotParts.length; i++) {
    if (i > 0) spoken.push("dot");
    const hyphenParts = dotParts[i]!.split("-").filter(Boolean);
    for (const segment of hyphenParts) {
      spoken.push(speakSegment(segment));
    }
  }

  return spoken.join(" ");
}

export function formatHostnamesForSpeech(names: string[]): string[] {
  return names.map((name) => formatHostnameForSpeech(name.split("/").pop() ?? name));
}
