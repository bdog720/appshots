/** Startup notices and save-conflict resolution shown above the editor. */

import { useState } from "react";
import type { StartupNotice } from "../../context/EditorContext";
import type { SaveStatus } from "../../lib/storage/useProjectPersistence";

const BAR = "flex flex-wrap items-center justify-center gap-3 px-4 py-2 text-xs";
const ACTION = "rounded-md border border-white/15 px-2.5 py-1 font-medium hover:bg-white/10 disabled:opacity-50";

export const StorageBanners = ({
  notice,
  conflict,
  conflictProjectName,
  onDismissNotice,
  onKeepMine,
  onLoadTheirs,
}: {
  notice: StartupNotice;
  conflict: Extract<SaveStatus, { kind: "conflict" }> | null;
  conflictProjectName: string | null;
  onDismissNotice: () => void;
  onKeepMine: () => Promise<void>;
  onLoadTheirs: () => Promise<void>;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!notice.unwritable && notice.migratedCount === 0 && !notice.migrationError && !conflict) return null;

  const resolve = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  };

  const moved = notice.migratedCount;

  return (
    <div className="shrink-0">
      {notice.unwritable && (
        <div role="alert" className={`${BAR} bg-amber-500/15 text-amber-200`}>
          <span>Container storage isn't writable — saving to this browser instead.</span>
          <button type="button" className={ACTION} onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      {moved > 0 && (
        <div role="status" className={`${BAR} bg-emerald-500/15 text-emerald-200`}>
          <span>
            Moved {moved} {moved === 1 ? "project" : "projects"} from this browser into the container.
          </span>
          <button type="button" className={ACTION} onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      {notice.migrationError && (
        <div role="alert" className={`${BAR} bg-amber-500/15 text-amber-200`}>
          <span>Couldn't move your projects into the container — they're still saved in this browser.</span>
          <button type="button" className={ACTION} onClick={onDismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      {conflict && (
        <div role="alert" className={`${BAR} bg-red-500/15 text-red-200`}>
          <span>“{conflictProjectName ?? "This project"}” was changed in another tab or device.</span>
          <button type="button" className={ACTION} disabled={pending} onClick={() => void resolve(onLoadTheirs)}>
            Load their version
          </button>
          <button type="button" className={ACTION} disabled={pending} onClick={() => void resolve(onKeepMine)}>
            Keep mine
          </button>
          {error && <span className="text-red-300">{error}</span>}
        </div>
      )}
    </div>
  );
};
