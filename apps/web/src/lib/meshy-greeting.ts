import type { MeshyVoiceLanguage } from "@/lib/meshy-voice-language";

/** First name or friendly label for spoken / written Meshy greetings. */
export function resolveMeshyDisplayName(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const fullName = input.name?.trim();
  if (fullName) {
    return fullName.split(/\s+/)[0] ?? fullName;
  }

  const email = input.email?.trim();
  if (email && email !== "unknown") {
    const local = email.split("@")[0] ?? "";
    const words = local.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
    if (words[0]) {
      const first = words[0];
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    }
  }

  return "";
}

function greetingAddressee(displayName: string): string {
  return displayName.trim() || "there";
}

const VOICE_GREETING_BY_LANG: Partial<
  Record<MeshyVoiceLanguage, (who: string) => string>
> = {
  en: (who) =>
    `Hello ${who}, I'm Meshy, your Kubernetes assistant. What would you like to know about your cluster?`,
  es: (who) =>
    `Hola ${who}, soy Meshy, tu asistente de Kubernetes. ¿Qué te gustaría saber sobre tu clúster?`,
  fr: (who) =>
    `Bonjour ${who}, je suis Meshy, votre assistant Kubernetes. Que souhaitez-vous savoir sur votre cluster ?`,
  de: (who) =>
    `Hallo ${who}, ich bin Meshy, Ihr Kubernetes-Assistent. Was möchten Sie über Ihren Cluster wissen?`,
  pt: (who) =>
    `Olá ${who}, eu sou a Meshy, sua assistente Kubernetes. O que você gostaria de saber sobre o seu cluster?`,
  hi: (who) =>
    `नमस्ते ${who}, मैं Meshy हूँ, आपकी Kubernetes सहायक। आप अपने क्लस्टर के बारे में क्या जानना चाहेंगे?`,
  ko: (who) =>
    `안녕하세요 ${who}님, 저는 Kubernetes 어시스턴트 Meshy입니다. 클러스터에 대해 무엇이 궁금하신가요?`,
  ja: (who) =>
    `こんにちは、${who}さん。KubernetesアシスタントのMeshyです。クラスタについて何を知りたいですか？`,
};

export function buildMeshyVoiceGreeting(
  displayName: string,
  language: MeshyVoiceLanguage = "en",
): string {
  const who = greetingAddressee(displayName);
  const template = VOICE_GREETING_BY_LANG[language] ?? VOICE_GREETING_BY_LANG.en!;
  return template(who);
}

export function buildMeshyWelcomeMarkdown(displayName: string): string {
  const who = greetingAddressee(displayName);
  return `Hello ${who}! I'm **Meshy**, your Kubernetes assistant. Ask me anything about your cluster — health, pod issues, diagnostics, or general questions.`;
}
