import { z } from "zod";
import type { InfraiClient } from "./infrai_client.js";

export const tenantInput = z.object({
  tenantId: z.string().min(2),
  email: z.string().email(),
  name: z.string().min(1),
});

export type TenantInput = z.infer<typeof tenantInput>;

export type TenantAccess = {
  tenantId: string;
  userId: string;
  keyId: string;
  apiKey: string;
};

type CreatedUser = { user_id: string };
type CreatedKey = { id: string; key: string };

export class TenantLifecycle {
  private readonly tenants = new Map<string, TenantAccess>();
  private readonly infrai: InfraiClient;

  constructor(infrai: InfraiClient) {
    this.infrai = infrai;
  }

  async onboard(input: TenantInput): Promise<TenantAccess> {
    const user = await this.infrai.request<CreatedUser>("POST", "/v1/auth/user/create", {
      email: input.email,
      name: input.name,
      metadata: { tenant_id: input.tenantId },
      mode: "service",
      idempotency_key: `tenant-user-${input.tenantId}`,
    });

    // The auth result flows directly into account key creation through the same client.
    const key = await this.infrai.request<CreatedKey>("POST", "/v1/account/keys/create", {
      project_id: user.user_id,
      name: `logistics-${input.tenantId}`,
      scopes: ["shipment:write", "shipment:read"],
      idempotency_key: `tenant-key-${input.tenantId}`,
    });

    const access = { tenantId: input.tenantId, userId: user.user_id, keyId: key.id, apiKey: key.key };
    this.tenants.set(input.tenantId, access);
    return access;
  }

  async offboard(tenantId: string): Promise<{ tenantId: string; revoked: true; userDeleted: true }> {
    const access = this.tenants.get(tenantId);
    if (!access) throw new Error(`Unknown tenant: ${tenantId}`);

    const results = await Promise.allSettled([
      this.infrai.request<unknown>("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(access.keyId)}`),
      this.infrai.request<unknown>("DELETE", `/v1/auth/user/delete/${encodeURIComponent(access.userId)}`),
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), "Tenant offboarding incomplete");

    this.tenants.delete(tenantId);
    return { tenantId, revoked: true, userDeleted: true };
  }
}
