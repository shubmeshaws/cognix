"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CognixLogo } from "@/components/brand/CognixLogo";
import { Button } from "@/components/ui/button";
import { applyDatabaseSchema, checkDatabaseConnection } from "@/lib/setup-api";

type Step = "welcome" | "setup";

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [dbChecked, setDbChecked] = useState(false);
  const [dbOk, setDbOk] = useState(false);
  const [dbDetail, setDbDetail] = useState<string | null>(null);
  const [schemaDetail, setSchemaDetail] = useState<string | null>(null);
  const [schemaStepDone, setSchemaStepDone] = useState(false);
  const [checkingDb, setCheckingDb] = useState(false);
  const [applyingSchema, setApplyingSchema] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckDb() {
    setError(null);
    setCheckingDb(true);
    setDbChecked(false);
    setDbOk(false);
    setSchemaStepDone(false);
    setSchemaDetail(null);

    try {
      const result = await checkDatabaseConnection();
      setDbChecked(true);
      setDbOk(result.ok);
      setDbDetail(result.detail);
    } catch (err) {
      setDbChecked(true);
      setDbOk(false);
      const msg = err instanceof Error ? err.message : "Database check failed";
      setDbDetail(
        msg === "Failed to fetch"
          ? "Cannot reach /api/setup on the web app. Restart pnpm dev:web after git pull, and ensure pnpm dev:agent is running."
          : msg,
      );
    } finally {
      setCheckingDb(false);
    }
  }

  async function handleApplySchema() {
    setError(null);
    setApplyingSchema(true);

    try {
      const result = await applyDatabaseSchema();
      if (!result.ok) {
        setError(result.detail);
        return;
      }

      setSchemaDetail(result.detail);
      setSchemaStepDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply schema");
    } finally {
      setApplyingSchema(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-12 shadow-sm">
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <CognixLogo variant="inline" markSize={64} showTagline />
          <p className="text-base text-muted-foreground">
            Prepare your Cognix environment before signing in
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {step === "welcome" ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <p className="mb-2 text-base font-medium text-foreground">
                Welcome to Cognix
              </p>
              <p className="mb-6 text-sm text-muted-foreground">
                Verify your database connection and create the required schema
                before generating admin credentials.
              </p>
              <Button
                type="button"
                className="w-full bg-blue-600 text-white shadow hover:bg-blue-700"
                onClick={() => setStep("setup")}
              >
                Get started
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-6">
              <p className="mb-5 text-base font-medium text-foreground">
                Database setup
              </p>

              <div className="flex flex-col gap-4">
                <div>
                  <Button
                    type="button"
                    className="w-full bg-blue-600 text-white shadow hover:bg-blue-700"
                    disabled={checkingDb}
                    onClick={() => void handleCheckDb()}
                  >
                    {checkingDb ? "Checking…" : "Check DB connection"}
                  </Button>
                  {dbChecked ? (
                    <p
                      className={`mt-3 text-sm ${
                        dbOk ? "text-emerald-600" : "text-destructive"
                      }`}
                    >
                      {dbDetail}
                    </p>
                  ) : null}
                </div>

                {dbOk ? (
                  <div>
                    <Button
                      type="button"
                      className="w-full bg-blue-600 text-white shadow hover:bg-blue-700"
                      disabled={applyingSchema || schemaStepDone}
                      onClick={() => void handleApplySchema()}
                    >
                      {applyingSchema
                        ? "Creating schema…"
                        : "Create Database schemas"}
                    </Button>
                    {schemaStepDone && schemaDetail ? (
                      <p className="mt-3 text-sm text-emerald-600">{schemaDetail}</p>
                    ) : null}
                  </div>
                ) : null}

                {schemaStepDone ? (
                  <Button
                    type="button"
                    className="w-full bg-blue-600 text-white shadow hover:bg-blue-700"
                    onClick={() => router.push("/login")}
                  >
                    Continue to admin setup
                  </Button>
                ) : null}
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
