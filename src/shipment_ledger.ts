import { z } from "zod";

const proofOfDelivery = z.object({
  storageKey: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const shipmentException = z.object({
  code: z.enum(["ADDRESS_MISMATCH", "DAMAGED_PACKAGE", "RECIPIENT_UNAVAILABLE"]),
  severity: z.enum(["low", "high"]),
  note: z.string().min(1),
});

export const shipmentEventInput = z.object({
  tenantId: z.string().min(2),
  shipmentId: z.string().min(2),
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  status: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
  proof: proofOfDelivery.optional(),
  exception: shipmentException.optional(),
}).superRefine((event, context) => {
  if (event.status === "delivered" && !event.proof) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["proof"], message: "Delivered shipments require proof" });
  }
  if (event.status === "exception" && !event.exception) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exception"], message: "Exception status requires details" });
  }
});

export type ShipmentEvent = z.infer<typeof shipmentEventInput>;
export type ShipmentDecision = "recorded" | "manual_review";

export class ShipmentLedger {
  private readonly events = new Map<string, ShipmentEvent>();

  record(event: ShipmentEvent): { shipmentId: string; decision: ShipmentDecision } {
    if (this.events.has(event.eventId)) return { shipmentId: event.shipmentId, decision: this.decision(event) };
    this.events.set(event.eventId, event);
    return { shipmentId: event.shipmentId, decision: this.decision(event) };
  }

  private decision(event: ShipmentEvent): ShipmentDecision {
    return event.exception?.severity === "high" ? "manual_review" : "recorded";
  }
}
