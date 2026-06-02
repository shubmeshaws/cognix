/** Voice activity detection — starts on loud/close speech, ends on pause. */

export interface VoiceActivityCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onLevel?: (rms: number, isLoud: boolean) => void;
}

const SPEECH_START_MS = 120;
/** End utterance after ~3s of silence (sentence complete). */
const SILENCE_END_MS = 3000;
const MIN_SPEECH_MS = 350;
const CALIBRATE_MS = 700;

export class VoiceActivityMonitor {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;

  private noiseFloor = 0.008;
  private calibrateUntil = 0;
  private speechStreakMs = 0;
  private silenceStreakMs = 0;
  private userSpeaking = false;
  private speechStartedAt = 0;
  private paused = false;
  private lastTickAt = 0;

  constructor(private callbacks: VoiceActivityCallbacks) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext();
    await this.audioContext.resume();

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    source.connect(this.analyser);
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    this.noiseFloor = 0.008;
    this.calibrateUntil = performance.now() + CALIBRATE_MS;
    this.speechStreakMs = 0;
    this.silenceStreakMs = 0;
    this.userSpeaking = false;
    this.lastTickAt = performance.now();
    this.loop();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.speechStreakMs = 0;
      this.silenceStreakMs = 0;
      if (this.userSpeaking) {
        this.userSpeaking = false;
        this.callbacks.onSpeechEnd();
      }
    }
  }

  stop(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.audioContext?.close();
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.userSpeaking = false;
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.analyser || !this.dataArray || this.paused) return;

    const now = performance.now();
    const deltaMs = Math.min(now - this.lastTickAt, 50);
    this.lastTickAt = now;

    this.analyser.getByteTimeDomainData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const sample = (this.dataArray[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / this.dataArray.length);

    if (now < this.calibrateUntil) {
      this.noiseFloor = Math.max(this.noiseFloor * 0.85 + rms * 0.15, 0.004);
      this.callbacks.onLevel?.(rms, false);
      return;
    }

    if (!this.userSpeaking && rms < this.noiseFloor * 2) {
      this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03;
    }

    const threshold = Math.max(this.noiseFloor * 2.35, 0.012);
    const isLoud = rms > threshold;
    this.callbacks.onLevel?.(rms, isLoud);

    if (isLoud) {
      this.speechStreakMs += deltaMs;
      // Brief pauses between words — do not reset end timer completely
      this.silenceStreakMs = Math.max(0, this.silenceStreakMs - deltaMs * 0.5);
    } else {
      this.silenceStreakMs += deltaMs;
      this.speechStreakMs = 0;
    }

    if (!this.userSpeaking && this.speechStreakMs >= SPEECH_START_MS) {
      this.userSpeaking = true;
      this.speechStartedAt = now;
      this.silenceStreakMs = 0;
      this.callbacks.onSpeechStart();
      return;
    }

    if (
      this.userSpeaking &&
      this.silenceStreakMs >= SILENCE_END_MS &&
      now - this.speechStartedAt >= MIN_SPEECH_MS
    ) {
      this.userSpeaking = false;
      this.speechStreakMs = 0;
      this.silenceStreakMs = 0;
      this.callbacks.onSpeechEnd();
    }
  };
}
