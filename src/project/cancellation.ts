export interface LinkedAbortSignal {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function linkAbortSignals(lifetime: AbortSignal, external?: AbortSignal): LinkedAbortSignal {
  if (external === undefined) return { signal: lifetime, dispose() {} };
  const controller = new AbortController();
  const abort = () => controller.abort();
  lifetime.addEventListener("abort", abort, { once: true });
  external.addEventListener("abort", abort, { once: true });
  if (lifetime.aborted || external.aborted) controller.abort();
  let disposed = false;
  return {
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.removeEventListener("abort", abort);
      external.removeEventListener("abort", abort);
    },
  };
}
