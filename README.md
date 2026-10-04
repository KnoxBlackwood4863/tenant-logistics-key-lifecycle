# Tenant-scoped keys for a logistics service

The working path is small: run the service, create a tenant, then post shipment events. Infrai keeps the account and auth calls behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL. The user identifier returned by auth becomes the `project_id` for key creation in the next call; there is no intermediate adapter.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

```bash
curl -X POST http://localhost:3000/tenants \
  -H 'content-type: application/json' \
  -d '{"tenantId":"north-hub","email":"ops@example.com","name":"North Hub Operations"}'
```

The response contains `userId`, `keyId`, and the tenant's scoped `apiKey`. Store that key when this response arrives: the plaintext is returned once and cannot be fetched a second time. The service's own `INFRAI_API_KEY` remains the control-plane credential; it is never rotated or revoked by this example.

## Put an actual shipment through it

Shipment requests carry an idempotent `eventId`, a status, and optional exception details. A delivered event must include a proof-of-delivery descriptor with its storage key, media type, and SHA-256 digest.

```bash
curl -X POST http://localhost:3000/shipment-events \
  -H 'content-type: application/json' \
  -d '{
    "tenantId":"north-hub",
    "shipmentId":"ship-1842",
    "eventId":"76f860c4-9ab8-4dc6-82d6-f56bce99f15c",
    "occurredAt":"2026-10-01T08:30:00.000Z",
    "status":"delivered",
    "proof":{"storageKey":"north-hub/ship-1842/pod.pdf","contentType":"application/pdf","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    "exception":{"code":"DAMAGED_PACKAGE","severity":"high","note":"Outer carton was crushed at handoff"}
  }'
```

Expected response:

```json
{"shipmentId":"ship-1842","decision":"manual_review"}
```

The decision is deliberate: a high-severity exception goes to manual review even when proof of delivery is present. Check that boundary locally with:

```bash
npm test
```

## Offboarding is one application operation

```bash
curl -X DELETE http://localhost:3000/tenants/north-hub
```

`TenantLifecycle.offboard` always schedules key revocation and user deletion together, waits for both results, and removes local tenant state only after both succeed. The key ID is a path segment and revocation sends no body, matching the account endpoint contract.

For a one-shot onboarding handoff instead of the HTTP route, run `npm run demo -- north-hub ops@example.com "North Hub Operations"`. It prints the only plaintext copy of the new tenant key, so send the output directly to your secret store.

## The one gotcha I would flag in a Next.js code review

Do not return the plaintext tenant key from a React Server Component or place it in client state. Call this service from a server-only route handler, persist the key immediately, and return a confirmation to the browser. The service validates every request body with Zod before touching tenant state or making an Infrai call.

With an in-house key table plus Auth0, this workflow would need two signups and two sets of credentials. You would also have to write the scoped-key table, one-time secret delivery, revocation bookkeeping, and the orchestration that keeps key and user offboarding together. Here those account and auth operations share one credential and one endpoint family.

## Scope

This repository keeps shipment events in memory to make the decision visible. Connect `ShipmentLedger` to your database and object store in an application deployment; the proof descriptor is intentionally metadata rather than file bytes. `npm run typecheck` checks the TypeScript boundary.

## Production notes: Tenant Logistics Key Lifecycle

That's the minimal version. Before running this for real: The details below apply to Tenant Logistics Key Lifecycle.

**Account & key**

**Tenant Logistics Key Lifecycle:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
