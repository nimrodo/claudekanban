import type { SessionShape, SessionStatus } from "../../../domain/types.js";

export type { SessionStatus };

export type SessionDto = SessionShape;

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
