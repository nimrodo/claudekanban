import type { SessionDetailResponse, StateResponse, StreamEvent, Transport } from "./Transport.js";

export class HttpSseTransport implements Transport {
  constructor(private readonly baseUrl: string = "") {}

  async getState(): Promise<StateResponse> {
    const res = await fetch(`${this.baseUrl}/api/state`);
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
    source.onmessage = (evt: MessageEvent<string>) => {
      onEvent(JSON.parse(evt.data) as StreamEvent);
    };
    return () => source.close();
  }
}
