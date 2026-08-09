import type { SessionShape, SessionStatus } from "../../../domain/types.js";

export type { SessionStatus };

export type SessionDto = SessionShape;

export interface StateResponse {
  sessions: SessionDto[];
}

export interface EventDto {
  id: number;
  sessionId: string;
  ts: string;
  type: string;
  payload: string;
}

export interface SessionDetailResponse {
  session: SessionDto;
  events: EventDto[];
}

export interface StreamEvent {
  type: string;
  entityId: string;
}

export interface Transport {
  getState(): Promise<StateResponse>;
  getSessionDetail(id: string): Promise<SessionDetailResponse>;
  subscribe(onEvent: (event: StreamEvent) => void): () => void;
}
