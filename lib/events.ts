import { EventEmitter } from "events";

export interface WorkflowEvent {
  type: "workflow:start" | "workflow:complete" | "node:start" | "node:complete" | "node:error";
  workflowId: string;
  runId: string;
  nodeId?: string;
  nodeType?: string;
  status?: "RUNNING" | "SUCCESS" | "FAILED";
  outputs?: Record<string, any>;
  inputs?: Record<string, any>;
  usage?: any;
  error?: string;
  duration?: number;
  timestamp: number;
}

// Global event emitter instance across API route handlers
declare global {
  var __workflowEventEmitter: EventEmitter | undefined;
}

export const workflowEventEmitter =
  globalThis.__workflowEventEmitter || new EventEmitter();

if (process.env.NODE_ENV !== "production") {
  globalThis.__workflowEventEmitter = workflowEventEmitter;
}

// Increase maximum listeners for concurrent clients
workflowEventEmitter.setMaxListeners(100);

/**
 * Emits a structured workflow execution event
 */
export function emitWorkflowEvent(event: Omit<WorkflowEvent, "timestamp">): void {
  const fullEvent: WorkflowEvent = {
    ...event,
    timestamp: Date.now(),
  };

  // Emit both on global and workflow-specific channels
  workflowEventEmitter.emit("workflow:event", fullEvent);
  workflowEventEmitter.emit(`workflow:${event.workflowId}`, fullEvent);
  if (event.runId) {
    workflowEventEmitter.emit(`run:${event.runId}`, fullEvent);
  }
}

/**
 * Subscribes to events for a specific workflow
 */
export function subscribeWorkflowEvents(
  workflowId: string,
  callback: (event: WorkflowEvent) => void
): () => void {
  const channel = `workflow:${workflowId}`;
  workflowEventEmitter.on(channel, callback);

  return () => {
    workflowEventEmitter.off(channel, callback);
  };
}
