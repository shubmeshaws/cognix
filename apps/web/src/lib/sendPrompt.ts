/** Placeholder for future AI / navigation prompt integration */
export function sendPrompt(message: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("kubehealer:prompt", { detail: { message } }),
    );
  }
  console.info("[KubeHealer prompt]", message);
}
