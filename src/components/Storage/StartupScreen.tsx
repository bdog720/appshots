/** Shown while projects load, or when loading fails. */

export const StartupScreen = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-base text-sm text-zinc-300">
    <p role={onRetry ? "alert" : "status"}>{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500"
      >
        Try again
      </button>
    )}
  </div>
);
