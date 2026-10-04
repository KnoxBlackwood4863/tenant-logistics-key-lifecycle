import { infraiFromEnvironment } from "./infrai_client.js";
import { TenantLifecycle, tenantInput } from "./tenant_lifecycle.js";

const input = tenantInput.parse({
  tenantId: process.argv[2] ?? "north-hub",
  email: process.argv[3] ?? "ops@example.com",
  name: process.argv[4] ?? "North Hub Operations",
});

const lifecycle = new TenantLifecycle(infraiFromEnvironment());
const access = await lifecycle.onboard(input);

console.log(JSON.stringify({
  tenantId: access.tenantId,
  userId: access.userId,
  keyId: access.keyId,
  apiKey: access.apiKey,
  note: "Store this key now; its plaintext value cannot be retrieved again.",
}, null, 2));
