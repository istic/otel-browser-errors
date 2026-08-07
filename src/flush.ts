type Flushable = {
  forceFlush(): Promise<void>;
};

/**
 * Batched spans sit in a queue for up to the processor's scheduled delay
 * (~5s by default) before being sent. A user navigating away or reloading
 * the page - often the very next action after ErrorBoundary's fallback UI
 * appears - can easily beat that window, silently dropping exactly the
 * errors this package exists to report. Flushing on pagehide/hidden closes
 * that gap without waiting for the batch timer.
 */
export function registerFlushOnUnload(provider: Flushable): () => void {
  const flush = (): void => {
    provider.forceFlush().catch(() => {
      // Best-effort flush; nothing actionable if it fails.
    });
  };

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  };

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
