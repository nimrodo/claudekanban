export type SessionStatus = "queued" | "running" | "waiting" | "done" | "failed";

export interface SessionDto {
  id: string;
  parentSessionId: string | null;
  owner: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  cwd: string;
  model: string | null;
  recap: string | null;
}

export interface StateResponse {
  sessions: SessionDto[];
}

export interface StreamEvent {
  type: string;
  entityId: string;
}

export interface Transport {
  getState(): Promise<StateResponse>;
  subscribe(onEvent: (event: StreamEvent) => void): () => void;
}
