import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadGoogleFonts } from "../lib/google-fonts";
import { EditorProvider } from "../context/EditorContext";
import { EditorLayout } from "../components/EditorLayout";
import { StartupScreen } from "../components/Storage/StartupScreen";
import { bootstrapEditor, type BootstrapResult } from "../context/bootstrap-editor";

type BootState =
  | { kind: "loading"; message: string }
  | { kind: "failed"; message: string }
  | ({ kind: "ready" } & BootstrapResult);

/**
 * Browser storage and a container on localhost both answer in milliseconds, so
 * say nothing until loading is actually slow rather than flashing a message.
 */
const SLOW_START_MS = 400;

// One bootstrap per attempt, shared across React StrictMode's double effects so
// migration can never run twice at once.
let pending: { attempt: number; promise: Promise<BootstrapResult> } | null = null;
const startBootstrap = (attempt: number, onProgress: (message: string) => void) => {
  if (!pending || pending.attempt !== attempt) {
    pending = { attempt, promise: bootstrapEditor(onProgress) };
  }
  return pending.promise;
};

const RouteComponent = () => {
  const [attempt, setAttempt] = useState(0);
  const [boot, setBoot] = useState<BootState>({ kind: "loading", message: "Loading projects…" });
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    loadGoogleFonts();
  }, []);

  useEffect(() => {
    let active = true;
    setIsSlow(false);
    const slowTimer = setTimeout(() => {
      if (active) setIsSlow(true);
    }, SLOW_START_MS);

    startBootstrap(attempt, (message) => {
      if (active) setBoot({ kind: "loading", message });
    })
      .then((result) => {
        if (active) setBoot({ kind: "ready", ...result });
      })
      .catch((error: unknown) => {
        if (active) {
          setBoot({
            kind: "failed",
            message: error instanceof Error ? error.message : "Couldn't load projects",
          });
        }
      });

    return () => {
      active = false;
      clearTimeout(slowTimer);
    };
  }, [attempt]);

  if (boot.kind === "loading") {
    return isSlow ? (
      <StartupScreen message={boot.message} />
    ) : (
      <div className="h-screen bg-base" />
    );
  }
  if (boot.kind === "failed") {
    return (
      <StartupScreen
        message={boot.message}
        onRetry={() => {
          setBoot({ kind: "loading", message: "Loading projects…" });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <EditorProvider
      storage={boot.storage}
      initialState={boot.initialState}
      startupNotice={boot.notice}
    >
      <EditorLayout />
    </EditorProvider>
  );
};

export const Route = createFileRoute("/")({
  component: RouteComponent,
});
