import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const SUPERTONIC_BASE =
  process.env.SUPERTONIC_TTS_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:7788";
const SUPERTONIC_HOST = process.env.SUPERTONIC_TTS_HOST ?? "127.0.0.1";
const SUPERTONIC_PORT = process.env.SUPERTONIC_TTS_PORT ?? "7788";
const AUTO_START = process.env.SUPERTONIC_AUTO_START !== "false";

declare global {
  // eslint-disable-next-line no-var
  var __kubehealerSupertonicProcess: ChildProcess | undefined;
  // eslint-disable-next-line no-var
  var __kubehealerSupertonicStartPromise: Promise<{ ok: boolean; message: string }> | undefined;
}

function repoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "services/supertonic-tts"))) {
    return cwd;
  }
  return path.resolve(cwd, "../..");
}

function supertonicDir(): string {
  return process.env.SUPERTONIC_DIR ?? path.join(repoRoot(), "services/supertonic-tts");
}

function supertonicBin(): string {
  return path.join(supertonicDir(), ".venv/bin/supertonic");
}

function pythonBin(): string {
  return path.join(supertonicDir(), ".venv/bin/python3");
}

export async function isSupertonicReachable(
  baseUrl = SUPERTONIC_BASE,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/docs`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function ensureVenv(): void {
  const dir = supertonicDir();
  const bin = supertonicBin();
  if (existsSync(bin)) return;

  const python3 = process.env.PYTHON3 ?? "python3";
  execFileSync(python3, ["-m", "venv", ".venv"], { cwd: dir, stdio: "pipe" });
  execFileSync(
    pythonBin(),
    ["-m", "pip", "install", "-q", "-r", "requirements.txt"],
    { cwd: dir, stdio: "pipe", env: process.env },
  );
}

function spawnSupertonicServer(): ChildProcess {
  ensureVenv();

  const dir = supertonicDir();
  const cacheDir =
    process.env.SUPERTONIC_CACHE_DIR ?? path.join(dir, ".cache/supertonic3");

  const child = spawn(
    supertonicBin(),
    ["serve", "--host", SUPERTONIC_HOST, "--port", SUPERTONIC_PORT],
    {
      cwd: dir,
      env: {
        ...process.env,
        SUPERTONIC_CACHE_DIR: cacheDir,
      },
      detached: false,
      stdio: "ignore",
    },
  );

  child.on("exit", () => {
    if (global.__kubehealerSupertonicProcess === child) {
      global.__kubehealerSupertonicProcess = undefined;
    }
  });

  global.__kubehealerSupertonicProcess = child;
  return child;
}

async function waitForSupertonicReady(maxWaitMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isSupertonicReachable()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Start Supertonic locally if needed (dev). Safe to call repeatedly. */
export async function ensureSupertonicServer(): Promise<{
  ok: boolean;
  message: string;
  alreadyRunning?: boolean;
}> {
  if (await isSupertonicReachable()) {
    return { ok: true, message: "Supertonic is ready", alreadyRunning: true };
  }

  if (!AUTO_START) {
    return {
      ok: false,
      message:
        "Supertonic is not running and auto-start is disabled (SUPERTONIC_AUTO_START=false).",
    };
  }

  if (global.__kubehealerSupertonicStartPromise) {
    return global.__kubehealerSupertonicStartPromise;
  }

  global.__kubehealerSupertonicStartPromise = (async () => {
    try {
      if (!(await isSupertonicReachable())) {
        if (
          !global.__kubehealerSupertonicProcess ||
          global.__kubehealerSupertonicProcess.killed
        ) {
          spawnSupertonicServer();
        }
      }

      const ready = await waitForSupertonicReady();
      if (!ready) {
        return {
          ok: false,
          message:
            "Supertonic did not become ready in time. First run may still be downloading the model (~400MB).",
        };
      }

      return { ok: true, message: "Supertonic started" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start Supertonic";
      return { ok: false, message: msg };
    } finally {
      global.__kubehealerSupertonicStartPromise = undefined;
    }
  })();

  return global.__kubehealerSupertonicStartPromise;
}

export { SUPERTONIC_BASE };
