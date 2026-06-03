/** ISO 639-1 codes supported by Supertonic 3 TTS. */
export type MeshyVoiceLanguage =
  | "en"
  | "ko"
  | "ja"
  | "ar"
  | "bg"
  | "cs"
  | "da"
  | "de"
  | "el"
  | "es"
  | "et"
  | "fi"
  | "fr"
  | "hi"
  | "hr"
  | "hu"
  | "id"
  | "it"
  | "lt"
  | "lv"
  | "nl"
  | "pl"
  | "pt"
  | "ro"
  | "ru"
  | "sk"
  | "sl"
  | "sv"
  | "tr"
  | "uk"
  | "vi";

export const MESHY_VOICE_LANGUAGES: {
  code: MeshyVoiceLanguage;
  label: string;
}[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "ar", label: "Arabic" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "vi", label: "Vietnamese" },
  { code: "id", label: "Indonesian" },
  { code: "uk", label: "Ukrainian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "sv", label: "Swedish" },
  { code: "ro", label: "Romanian" },
  { code: "hu", label: "Hungarian" },
  { code: "bg", label: "Bulgarian" },
  { code: "hr", label: "Croatian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "el", label: "Greek" },
  { code: "et", label: "Estonian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
];

const VALID_CODES = new Set<string>(MESHY_VOICE_LANGUAGES.map((l) => l.code));

const SPEECH_RECOGNITION_LOCALE: Record<MeshyVoiceLanguage, string> = {
  en: "en-US",
  hi: "hi-IN",
  ko: "ko-KR",
  ja: "ja-JP",
  ar: "ar-SA",
  bg: "bg-BG",
  cs: "cs-CZ",
  da: "da-DK",
  de: "de-DE",
  el: "el-GR",
  es: "es-ES",
  et: "et-EE",
  fi: "fi-FI",
  fr: "fr-FR",
  hr: "hr-HR",
  hu: "hu-HU",
  id: "id-ID",
  it: "it-IT",
  lt: "lt-LT",
  lv: "lv-LV",
  nl: "nl-NL",
  pl: "pl-PL",
  pt: "pt-BR",
  ro: "ro-RO",
  ru: "ru-RU",
  sk: "sk-SK",
  sl: "sl-SI",
  sv: "sv-SE",
  tr: "tr-TR",
  uk: "uk-UA",
  vi: "vi-VN",
};

const STORAGE_KEY = "meshy-voice-language";

export function loadMeshyVoiceLanguage(): MeshyVoiceLanguage {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && VALID_CODES.has(stored)) {
    return stored as MeshyVoiceLanguage;
  }
  return "en";
}

export function saveMeshyVoiceLanguage(language: MeshyVoiceLanguage): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, language);
}

export function meshyLanguageLabel(code: MeshyVoiceLanguage): string {
  return MESHY_VOICE_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** BCP-47 locale for browser speech synthesis and recognition. */
export function meshyLanguageToSpeechRecognitionLang(
  language: MeshyVoiceLanguage = loadMeshyVoiceLanguage(),
): string {
  return SPEECH_RECOGNITION_LOCALE[language] ?? language;
}

const VOICE_TEST_PHRASES: Record<MeshyVoiceLanguage, string> = {
  en: "Hello, I'm Meshy. This is how I will sound for alerts and voice chat.",
  hi: "नमस्ते, मैं मेशी हूँ। अलर्ट और वॉइस चैट में आपको यही आवाज़ सुनाई देगी।",
  ko: "안녕하세요, 저는 Meshy입니다. 알림과 음성 채팅에서 이렇게 들리게 됩니다.",
  ja: "こんにちは、Meshyです。アラートと音声チャットではこの声で話します。",
  ar: "مرحباً، أنا Meshy. هكذا سأبدو في التنبيهات والدردشة الصوتية.",
  de: "Hallo, ich bin Meshy. So werde ich bei Warnungen und Sprachchat klingen.",
  es: "Hola, soy Meshy. Así sonaré en alertas y chat de voz.",
  fr: "Bonjour, je suis Meshy. Voici comment je parlerai pour les alertes et le chat vocal.",
  pt: "Olá, eu sou a Meshy. É assim que vou soar nos alertas e no chat de voz.",
  ru: "Здравствуйте, я Meshy. Так я буду звучать в оповещениях и голосовом чате.",
  it: "Ciao, sono Meshy. Ecco come suonerò per avvisi e chat vocale.",
  nl: "Hallo, ik ben Meshy. Zo klink ik bij meldingen en spraakchat.",
  pl: "Cześć, jestem Meshy. Tak będę brzmieć w alertach i czacie głosowym.",
  tr: "Merhaba, ben Meshy. Uyarılar ve sesli sohbette sesim böyle olacak.",
  vi: "Xin chào, tôi là Meshy. Đây là giọng nói của tôi cho cảnh báo và trò chuyện thoại.",
  id: "Halo, saya Meshy. Beginilah suara saya untuk peringatan dan obrolan suara.",
  uk: "Вітаю, я Meshy. Ось так я звучатиму в сповіщеннях і голосовому чаті.",
  cs: "Ahoj, jsem Meshy. Takto budu znít u upozornění a hlasového chatu.",
  da: "Hej, jeg er Meshy. Sådan lyder jeg ved advarsler og stemmechat.",
  fi: "Hei, olen Meshy. Näin kuulostan hälytyksissä ja puhechatissa.",
  sv: "Hej, jag är Meshy. Så här låter jag vid aviseringar och röstchatt.",
  ro: "Bună, sunt Meshy. Așa voi suna la alerte și chat vocal.",
  hu: "Szia, Meshy vagyok. Így fogok hangzani riasztásoknál és hangos csevegésnél.",
  bg: "Здравейте, аз съм Meshy. Така ще звуча при известия и гласов чат.",
  hr: "Bok, ja sam Meshy. Ovako ću zvučati u upozorenjima i glasovnom chatu.",
  sk: "Ahoj, som Meshy. Takto budem znieť pri upozorneniach a hlasovom chate.",
  sl: "Živjo, sem Meshy. Tako bom zvenela ob opozorilih in glasovnem klepetu.",
  el: "Γεια σας, είμαι η Meshy. Έτσι θα ακούγομαι στις ειδοποιήσεις και τη φωνητική συνομιλία.",
  et: "Tere, mina olen Meshy. Nii kõlan ma hoiatuste ja häälvestluse puhul.",
  lt: "Sveiki, aš Meshy. Taip skambėsiu perspėjimuose ir balso pokalbyje.",
  lv: "Sveiki, es esmu Meshy. Tā es skanēšu brīdinājumos un balss tērzē.",
};

export function meshyVoiceTestPhrase(
  language: MeshyVoiceLanguage = loadMeshyVoiceLanguage(),
): string {
  return VOICE_TEST_PHRASES[language] ?? VOICE_TEST_PHRASES.en;
}
