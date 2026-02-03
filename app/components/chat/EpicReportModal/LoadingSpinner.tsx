"use client";

interface LoadingSpinnerProps {
  progress?: { current: number; total: number };
}

/**
 * Loading spinner component with optional progress indicator.
 */
export function LoadingSpinner({ progress }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center w-full max-w-md">
        <div className="relative inline-block mb-4 w-8 h-8">
          <style dangerouslySetInnerHTML={{
            __html: `
            @keyframes spin-trail {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .spinner-trail-1 {
              animation: spin-trail 1s linear infinite;
              animation-delay: 0s;
            }
            .spinner-trail-2 {
              animation: spin-trail 1s linear infinite;
              animation-delay: 0.15s;
              opacity: 0.6;
            }
            .spinner-trail-3 {
              animation: spin-trail 1s linear infinite;
              animation-delay: 0.3s;
              opacity: 0.4;
            }
            .spinner-trail-4 {
              animation: spin-trail 1s linear infinite;
              animation-delay: 0.45s;
              opacity: 0.2;
            }
          ` }} />
          <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-1" />
          <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-2" />
          <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-3" />
          <div className="absolute inset-0 rounded-full border-b-2 border-[var(--blue)] spinner-trail-4" />
        </div>
        <p className="text-sm text-[var(--fg-muted)] mb-2">
          Loading epic report...
        </p>
        {progress && progress.total > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
              <span>
                Processing {progress.current} of {progress.total} epics
              </span>
              <span className="font-medium text-[var(--fg)]">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-2 bg-[var(--bg-highlight)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--blue)] rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
