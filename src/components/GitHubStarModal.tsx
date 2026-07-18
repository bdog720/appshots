import { useEffect } from "react";
import { ExternalLink, Star, X } from "lucide-react";
import { GITHUB_REPO_URL } from "../constants";

interface GitHubStarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const BACKDROP_CLASSES =
  "fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200";

const MODAL_CLASSES =
  "w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-section shadow-[0_32px_120px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-200";

export const GitHubStarModal = ({
  isOpen,
  onClose,
}: GitHubStarModalProps) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={BACKDROP_CLASSES}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-star-modal-title"
        className={MODAL_CLASSES}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/15 bg-amber-400/12 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-amber-200">
              <Star size={14} className="fill-amber-300 text-amber-300" />
              Support AppShots
            </div>
            <div className="max-w-md">
              <h2
                id="github-star-modal-title"
                className="text-3xl font-semibold tracking-tight text-white"
              >
                Enjoying the export?
              </h2>
              <p className="mt-3 text-base leading-7 text-zinc-300">
                Please give us a star on GitHub if AppShots is helping you ship
                better screenshots.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close GitHub star modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="rounded-xl border border-white/10 bg-input px-4 py-4 shadow-inner shadow-black/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              GitHub URL
            </p>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block break-all rounded-xl bg-black/20 px-3 py-3 text-base font-medium leading-6 text-zinc-50 ring-1 ring-inset ring-white/8 transition-colors hover:bg-black/30 hover:text-white"
            >
              {GITHUB_REPO_URL}
            </a>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Open the repo and tap the star in the top-right corner.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              Maybe later
            </button>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_12px_30px_rgba(251,191,36,0.22)] transition-colors hover:bg-amber-200"
            >
              <Star size={16} className="fill-current" />
              Give us a star
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
