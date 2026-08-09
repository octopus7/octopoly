import type {
  MeshMutationResult,
  MeshQuery,
  RetopoEngine,
  RetopoStep,
  RetopoStrokeInput,
  RetopoStrokeSession,
  ToolPreview,
  Vec3,
} from "@octopoly/contracts";

import { inferQuadStrip } from "./quad";
import { buildQuadPreview, createQuadRequestSequence } from "./requests";
import type { QuadRequestSequence } from "./requests";
import { RetopoStrokeProcessor } from "./stroke";
import { buildSurfaceChain } from "./surface-chain";
import type { RetopoSurfaceChain } from "./surface-chain";

export * from "./quad";
export * from "./requests";
export * from "./stroke";
export * from "./surface-chain";

export const RETOPO_STAGED_STEP_HARD_LIMIT = 4_096;

export interface RetopoEngineOptions {
  readonly maxStagedSteps?: number;
}

const CHAIN_COLOR = Object.freeze({ x: 0.2, y: 0.92, z: 0.72, w: 0.9 });

export class DeterministicRetopoEngine implements RetopoEngine {
  readonly #maxStagedSteps: number;
  #pendingChain: RetopoSurfaceChain | null = null;
  #activeSession: DeterministicRetopoStrokeSession | null = null;

  constructor(options: RetopoEngineOptions = {}) {
    this.#maxStagedSteps = resolveStepBudget(options.maxStagedSteps);
  }

  begin(): RetopoStrokeSession {
    if (this.#activeSession !== null) {
      throw new Error("a retopo stroke session is already active");
    }

    const session = new DeterministicRetopoStrokeSession(
      this.#pendingChain,
      this.#maxStagedSteps,
      (chain) => {
        if (this.#activeSession !== session) {
          throw new Error("retopo stroke session ownership changed");
        }
        this.#pendingChain = chain;
      },
      () => {
        if (this.#activeSession === session) {
          this.#pendingChain = null;
        }
      },
      () => {
        if (this.#activeSession === session) {
          this.#activeSession = null;
        }
      },
    );
    this.#activeSession = session;
    return session;
  }
}

export function createRetopoEngine(options: RetopoEngineOptions = {}): RetopoEngine {
  return new DeterministicRetopoEngine(options);
}

type SessionState = "collecting" | "waiting" | "closed" | "cancelled" | "disposed";

class DeterministicRetopoStrokeSession implements RetopoStrokeSession {
  readonly #processor = new RetopoStrokeProcessor();
  readonly #firstChain: RetopoSurfaceChain | null;
  readonly #maxStagedSteps: number;
  readonly #storeFirstChain: (chain: RetopoSurfaceChain) => void;
  readonly #clearFirstChain: () => void;
  readonly #release: () => void;
  #state: SessionState = "collecting";
  #pointerId: number | null = null;
  #requestSequence: QuadRequestSequence | null = null;
  #emittedCommitSteps = 0;

  constructor(
    firstChain: RetopoSurfaceChain | null,
    maxStagedSteps: number,
    storeFirstChain: (chain: RetopoSurfaceChain) => void,
    clearFirstChain: () => void,
    release: () => void,
  ) {
    this.#firstChain = firstChain;
    this.#maxStagedSteps = maxStagedSteps;
    this.#storeFirstChain = storeFirstChain;
    this.#clearFirstChain = clearFirstChain;
    this.#release = release;
  }

  update(input: RetopoStrokeInput, mesh: MeshQuery): RetopoStep {
    this.#assertCollecting();

    const { sample } = input;
    const accepted = this.#processor.update(input);
    if (sample.pointerType !== "pen" || !sample.isPrimary) {
      return { kind: "none" };
    }
    if (this.#pointerId === null) {
      if (sample.phase !== "down") {
        return { kind: "none" };
      }
      this.#pointerId = sample.pointerId;
    } else if (sample.pointerId !== this.#pointerId) {
      return { kind: "none" };
    }

    if (sample.phase === "cancel") {
      this.cancel();
      return { kind: "none" };
    }
    if (sample.phase === "hover") {
      return { kind: "none" };
    }

    if (accepted.length === 0) {
      if (sample.phase === "up") {
        return this.#finishRejected("degenerate stroke");
      }
      return { kind: "none" };
    }

    const chainResult = buildSurfaceChain(accepted, mesh);
    if (chainResult.kind === "rejected") {
      if (chainResult.reason === "degenerate-chain" && sample.phase !== "up") {
        const preview = previewForChains(chainResult.partial, this.#firstChain, accepted.length);
        return preview === undefined ? { kind: "none" } : { kind: "preview", preview };
      }
      return this.#finishRejected(`surface chain rejected: ${chainResult.reason}`);
    }

    if (sample.phase !== "up") {
      const preview = previewForChains(chainResult.chain, this.#firstChain, accepted.length);
      if (preview === undefined) {
        throw new Error("a complete retopo chain must produce a preview");
      }
      return {
        kind: "preview",
        preview,
      };
    }

    if (this.#firstChain === null) {
      this.#storeFirstChain(chainResult.chain);
      this.#finish("closed");
      return { kind: "complete" };
    }

    const inference = inferQuadStrip(this.#firstChain, chainResult.chain, mesh);
    if (inference.kind === "rejected") {
      return this.#finishRejected(`quad inference rejected: ${inference.reason}`);
    }

    const preview = buildQuadPreview(inference.candidates, accepted.length);
    this.#requestSequence = createQuadRequestSequence(inference.candidates, preview);
    return this.#handleRequestStep(this.#requestSequence.start(mesh));
  }

  continue(result: MeshMutationResult, mesh: MeshQuery): RetopoStep {
    this.#assertWaiting();
    const requestSequence = this.#requestSequence;
    if (requestSequence === null) {
      throw new Error("retopo request sequence is missing");
    }
    return this.#handleRequestStep(requestSequence.continue(result, mesh));
  }

  cancel(): void {
    if (this.#state === "cancelled" || this.#state === "disposed") {
      return;
    }
    if (this.#state === "closed") {
      return;
    }
    this.#processor.cancel();
    this.#requestSequence?.cancel();
    this.#finish("cancelled");
  }

  dispose(): void {
    if (this.#state === "disposed") {
      return;
    }
    if (this.#state !== "closed" && this.#state !== "cancelled") {
      this.#requestSequence?.dispose();
    }
    this.#processor.dispose();
    this.#state = "disposed";
    this.#release();
  }

  #handleRequestStep(step: RetopoStep): RetopoStep {
    if (step.kind === "commit") {
      if (this.#emittedCommitSteps >= this.#maxStagedSteps) {
        this.#requestSequence?.cancel();
        return this.#finishRejected(
          `retopo staged step budget exceeded (${this.#maxStagedSteps})`,
        );
      }
      this.#emittedCommitSteps += 1;
      this.#state = "waiting";
      return step;
    }
    if (step.kind === "complete") {
      this.#clearFirstChain();
      this.#finish("closed");
      return step;
    }
    if (step.kind === "rejected") {
      return this.#finishRejected(step.reason, step.preview);
    }
    throw new Error(`quad request sequence returned invalid ${step.kind} step`);
  }

  #finishRejected(reason: string, preview?: ToolPreview): RetopoStep {
    this.#finish("closed");
    return preview === undefined
      ? { kind: "rejected", reason }
      : { kind: "rejected", reason, preview };
  }

  #finish(state: Extract<SessionState, "closed" | "cancelled">): void {
    this.#state = state;
    this.#release();
  }

  #assertCollecting(): void {
    if (this.#state !== "collecting") {
      throw new Error(`retopo stroke session cannot update while ${this.#state}`);
    }
  }

  #assertWaiting(): void {
    if (this.#state !== "waiting") {
      throw new Error(`retopo stroke session cannot continue while ${this.#state}`);
    }
  }
}

function resolveStepBudget(value: number | undefined): number {
  const resolved = value ?? RETOPO_STAGED_STEP_HARD_LIMIT;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved <= 0 ||
    resolved > RETOPO_STAGED_STEP_HARD_LIMIT
  ) {
    throw new RangeError(
      `maxStagedSteps must be a positive safe integer no greater than ${RETOPO_STAGED_STEP_HARD_LIMIT}`,
    );
  }
  return resolved;
}

function previewForChains(
  current: RetopoSurfaceChain,
  first: RetopoSurfaceChain | null,
  revision: number,
): ToolPreview | undefined {
  const chains = first === null ? [current] : [first, current];
  const primitives: ToolPreview["primitives"][number][] = [];
  for (const chain of chains) {
    const positions = chain.points.map((point) => copyVector(point.position));
    if (positions.length === 1) {
      primitives.push({ kind: "points", positions, color: CHAIN_COLOR, sizeCssPx: 5 });
    } else if (positions.length > 1) {
      primitives.push({ kind: "polyline", positions, color: CHAIN_COLOR, widthCssPx: 2 });
    }
  }
  if (primitives.length === 0) {
    return undefined;
  }
  return {
    id: "retopo-chain-preview",
    revision,
    primitives,
  };
}

function copyVector(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}
