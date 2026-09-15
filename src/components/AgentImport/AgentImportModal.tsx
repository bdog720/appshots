/**
 * AgentImportModal
 *
 * Imports an agent-produced bundle (appshots.json + screenshots, as a folder,
 * files, or zip) as a polished project, and hands out the agent prompt and JSON
 * Schema so the whole workflow lives in one place.
 */

import { useRef, useState } from "react";
import { Bot, ClipboardCopy, Download, FolderOpen, Upload, X } from "lucide-react";
import { useEditor } from "../../context/EditorContext";
import {
  buildAgentPrompt,
  buildJsonSchema,
  filesFromDataTransfer,
  formatIssue,
  readImageFile,
  runAgentImport,
  type AgentImportMode,
  type ImportIssue,
} from "../../lib/agent-import";
import { useModalDismiss } from "../../lib/useModalDismiss";
import type { Project } from "../../types";

interface AgentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step =
  | { kind: "drop" }
  | { kind: "working" }
  | { kind: "errors"; errors: ImportIssue[] }
  | {
      kind: "summary";
      project: Project;
      warnings: ImportIssue[];
      storageWarning: ImportIssue | null;
    };

const createId = () => Math.random().toString(36).substring(2, 9);

const BUTTON =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const SECONDARY = `${BUTTON} border border-white/10 bg-input text-zinc-200 hover:bg-white/10`;
const PRIMARY = `${BUTTON} bg-violet-600 text-white hover:bg-violet-500`;

export const AgentImportModal = ({ isOpen, onClose }: AgentImportModalProps) => {
  const { projects, applyAgentImport } = useEditor();
  const modalRef = useRef<HTMLDivElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: "drop" });
  const [copied, setCopied] = useState<"prompt" | "errors" | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Bumped on close and on every new import; a result whose id is stale is ignored.
  const requestIdRef = useRef(0);

  const close = () => {
    requestIdRef.current += 1;
    setStep({ kind: "drop" });
    setCopied(null);
    onClose();
  };
  useModalDismiss({ isOpen, onClose: close, containerRef: modalRef });

  if (!isOpen) return null;

  // Accepts a pending folder walk so progress shows immediately and walk
  // failures land in the same error step as pipeline failures.
  const importFiles = async (source: File[] | Promise<File[]>) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestIdRef.current === requestId;
    setStep({ kind: "working" });
    try {
      const files = await source;
      if (!isCurrent()) return;
      if (files.length === 0) {
        setStep({ kind: "drop" });
        return;
      }
      const result = await runAgentImport(files, {
        readImage: readImageFile,
        generateId: createId,
        existingStorageChars: JSON.stringify(projects).length,
      });
      if (!isCurrent()) return;
      setStep(
        result.ok
          ? {
              kind: "summary",
              project: result.project,
              warnings: result.warnings,
              storageWarning: result.storageWarning ?? null,
            }
          : { kind: "errors", errors: result.errors },
      );
    } catch (error) {
      if (!isCurrent()) return;
      setStep({
        kind: "errors",
        errors: [
          { path: "", message: error instanceof Error ? error.message : "Import failed." },
        ],
      });
    }
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow picking the same files again
    if (files.length > 0) void importFiles(files);
  };

  const copy = async (kind: "prompt" | "errors", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  };

  const downloadSchema = () => {
    const blob = new Blob([`${JSON.stringify(buildJsonSchema(), null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "appshots-import.schema.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const apply = (project: Project, mode: AgentImportMode) => {
    applyAgentImport(project, mode);
    close();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
      // Swallow drops that miss the drop zone so the browser doesn't open the file.
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import from agent"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-section shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bot className="h-4 w-4 text-violet-400" />
            Import from agent
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close import from agent"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4 text-sm text-zinc-300">
          {step.kind === "drop" && (
            <>
              <section className="space-y-2">
                <h3 className="font-medium text-white">1. Give your agent the prompt</h3>
                <p className="text-zinc-400">
                  Paste it into an AI agent working in your app's repository. It writes{" "}
                  <code className="text-zinc-200">appshots.json</code> next to your screenshots.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={SECONDARY} onClick={() => copy("prompt", buildAgentPrompt())}>
                    <ClipboardCopy className="h-4 w-4" />
                    {copied === "prompt" ? "Copied" : "Copy agent prompt"}
                  </button>
                  <button type="button" className={SECONDARY} onClick={downloadSchema}>
                    <Download className="h-4 w-4" />
                    Download schema
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium text-white">2. Import the result</h3>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragOver(false);
                    // Called synchronously: DataTransfer items must be read before any await.
                    void importFiles(filesFromDataTransfer(event.dataTransfer));
                  }}
                  className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    isDragOver ? "border-violet-500 bg-violet-500/10" : "border-white/10"
                  }`}
                >
                  <Upload className="h-6 w-6 text-zinc-500" />
                  <p>
                    Drop the folder with <code className="text-zinc-200">appshots.json</code> and its
                    screenshots, or a zip of it
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" className={SECONDARY} onClick={() => folderInputRef.current?.click()}>
                      <FolderOpen className="h-4 w-4" />
                      Choose folder…
                    </button>
                    <button type="button" className={SECONDARY} onClick={() => filesInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      Choose files…
                    </button>
                  </div>
                </div>
                <input
                  ref={filesInputRef}
                  type="file"
                  multiple
                  accept=".json,.zip,image/png,image/jpeg,image/webp"
                  aria-label="Choose files"
                  className="hidden"
                  onChange={onPick}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  aria-label="Choose folder"
                  className="hidden"
                  onChange={onPick}
                  {...{ webkitdirectory: "" }}
                />
              </section>
            </>
          )}

          {step.kind === "working" && (
            <p role="status" className="py-8 text-center text-zinc-400">
              Reading bundle…
            </p>
          )}

          {step.kind === "errors" && (
            <section className="space-y-3">
              <p>AppShots couldn't import this bundle. Paste these back to your agent:</p>
              <ul className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                {step.errors.map((issue, index) => (
                  <li key={index}>
                    <code>{formatIssue(issue)}</code>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={SECONDARY}
                  onClick={() => copy("errors", step.errors.map(formatIssue).join("\n"))}
                >
                  <ClipboardCopy className="h-4 w-4" />
                  {copied === "errors" ? "Copied" : "Copy errors"}
                </button>
                <button type="button" className={SECONDARY} onClick={() => setStep({ kind: "drop" })}>
                  Try again
                </button>
              </div>
            </section>
          )}

          {step.kind === "summary" && (
            <section className="space-y-4">
              <div>
                <h3 className="font-medium text-white">{step.project.name}</h3>
                <p className="text-zinc-400">{step.project.screenshots.length} screens</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {step.project.screenshots.map((shot) => {
                  const src = shot.devices.find((d) => d.screenshotSrc)?.screenshotSrc;
                  return src ? (
                    <img key={shot.id} src={src} alt="" className="h-24 rounded border border-white/10" />
                  ) : (
                    <div key={shot.id} className="h-24 w-11 shrink-0 rounded border border-white/10 bg-input" />
                  );
                })}
              </div>
              {step.warnings.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-amber-300">
                    {step.warnings.length} {step.warnings.length === 1 ? "warning" : "warnings"}
                  </h4>
                  <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                    {step.warnings.map((issue, index) => (
                      <li key={index}>{formatIssue(issue)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {step.storageWarning && (
                <div
                  role="alert"
                  className="space-y-1 rounded-lg border-2 border-rose-500/60 bg-rose-500/10 p-3 text-rose-200"
                >
                  <h4 className="text-sm font-semibold text-rose-100">This import may not save</h4>
                  <p className="text-xs">{step.storageWarning.message}</p>
                </div>
              )}
              <div className="space-y-2">
                <button type="button" className={`${PRIMARY} w-full justify-center`} onClick={() => apply(step.project, "new")}>
                  Create new project
                </button>
                <button type="button" className={`${SECONDARY} w-full justify-center`} onClick={() => apply(step.project, "replace")}>
                  Replace current project
                </button>
                <p className="text-xs text-zinc-500">
                  Replacing keeps the project's name. Undo restores the previous screenshots, but not
                  the export size.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
