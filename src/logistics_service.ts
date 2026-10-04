import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infraiFromEnvironment } from "./infrai_client.js";
import { shipmentEventInput, ShipmentLedger } from "./shipment_ledger.js";
import { tenantInput, TenantLifecycle } from "./tenant_lifecycle.js";

const infrai = infraiFromEnvironment();
const tenants = new TenantLifecycle(infrai);
const shipments = new ShipmentLedger();

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    handleError(response, error);
  }
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "POST" && url.pathname === "/tenants") {
    const input = tenantInput.parse(await readJson(request));
    const access = await tenants.onboard(input);
    send(response, 201, access);
    return;
  }
  const tenantMatch = url.pathname.match(/^\/tenants\/([^/]+)$/);
  if (request.method === "DELETE" && tenantMatch) {
    send(response, 200, await tenants.offboard(decodeURIComponent(tenantMatch[1])));
    return;
  }
  if (request.method === "POST" && url.pathname === "/shipment-events") {
    const event = shipmentEventInput.parse(await readJson(request));
    send(response, 202, shipments.record(event));
    return;
  }
  send(response, 404, { error: "Route not found" });
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64_000) throw new RequestError(413, "Request body is too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Request body must be valid JSON");
  }
}

function handleError(response: ServerResponse, error: unknown): void {
  if (error instanceof z.ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
  if (error instanceof InfraiError) return send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
  if (error instanceof RequestError) return send(response, error.status, { error: error.message });
  console.error(error);
  send(response, 500, { error: "Unexpected service error" });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Logistics service listening on http://localhost:${port}`));
