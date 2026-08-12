import type { SessionDetailResponse, StateResponse, StreamEvent, Transport } from "./Transport.js";

export class HttpSseTransport implements Transport {
  constructor(private readonly baseUrl: string = "") {}

  async getState(since?: number): Promise<StateResponse> {
    const url = since !== undefined ? `${this.baseUrl}/api/state?since=${since}` : `${this.baseUrl}/api/state`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
    return res.json() as Promise<StateResponse>;
  }

  async getSessionDetail(id: string): Promise<SessionDetailResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${id}`);
    if (!res.ok) throw new Error(`GET /api/sessions/${id} failed: ${res.status}`);
    return res.json() as Promise<SessionDetailResponse>;
  }

  subscribe(onEvent: (event: StreamEvent) => void): () => void {
    const source = new EventSource(`${this.baseUrl}/stream`);
    let lastEventId: number | undefined;
    let hasConnectedOnce = false;

    source.onmessage = (evt: MessageEvent<string>) => {
      if (evt.lastEventId) lastEventId = Number(evt.lastEventId);
      onEvent(JSON.parse(evt.data) as StreamEvent);
    };

    source.onopen = () => {
      if (hasConnectedOnce) {
        this.getState(lastEventId).then((state) => {
          onEvent({ type: "resync", sessions: state.sessions });
        });
      }
      hasConnectedOnce = true;
    };

    return () => source.close();
  }
}
