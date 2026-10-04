import assert from "node:assert/strict";
import test from "node:test";
import { ShipmentLedger, shipmentEventInput } from "../src/shipment_ledger.js";

test("a high-severity delivery exception goes to manual review", () => {
  const event = shipmentEventInput.parse({
    tenantId: "north-hub",
    shipmentId: "ship-1842",
    eventId: "76f860c4-9ab8-4dc6-82d6-f56bce99f15c",
    occurredAt: "2026-10-01T08:30:00.000Z",
    status: "delivered",
    proof: {
      storageKey: "north-hub/ship-1842/pod.pdf",
      contentType: "application/pdf",
      sha256: "a".repeat(64),
    },
    exception: {
      code: "DAMAGED_PACKAGE",
      severity: "high",
      note: "Outer carton was crushed at handoff",
    },
  });

  assert.deepEqual(new ShipmentLedger().record(event), {
    shipmentId: "ship-1842",
    decision: "manual_review",
  });
});
