import { EventEmitter } from "node:events";

export type RouterEventType =
  | "route.created"
  | "capability.selected"
  | "permission.decided"
  | "run.status"
  | "step.started"
  | "step.completed"
  | "checkpoint.saved"
  | "improvement.proposed";

export interface RouterEvent {
  type: RouterEventType;
  at: string;
  taskId: string;
  runId?: string;
  data: Record<string, unknown>;
}

export type RouterEventListener = (event: RouterEvent) => void;

export class RouterEventBus {
  private readonly emitter = new EventEmitter();

  emit(event: RouterEvent): void {
    this.emitter.emit("router-event", event);
  }

  subscribe(listener: RouterEventListener): () => void {
    this.emitter.on("router-event", listener);
    return () => this.emitter.off("router-event", listener);
  }
}
