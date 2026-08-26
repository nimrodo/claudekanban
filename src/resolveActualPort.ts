import type { Server } from "node:net";

export function resolveActualPort(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Server is not listening on a network port");
  }
  return address.port;
}
