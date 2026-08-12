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

export type StreamEvent =
  | { type: "session-changed"; entityId: string; patch?: SessionDto }
  // Synthetic event, fired by a transport after reconnecting, carrying a full state
  // snapshot to fill any gap missed while disconnected. Not about one entity, so no entityId.
  | { type: "resync"; sessions: SessionDto[] };

export interface Transport {
  getState(since?: number): Promise<StateResponse>;
  getSessionDetail(id: string): Promise<SessionDetailResponse>;
  subscribe(onEvent: (event: StreamEvent) => void): () => void;
}
