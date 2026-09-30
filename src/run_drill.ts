import { randomUUID } from "node:crypto";
import { infraiFromEnvironment } from "./infrai_client.js";
import { drillRequestSchema, runLeakedKeyDrill } from "./leaked_key_drill.js";

const input = drillRequestSchema.parse({
  workOrderId: "WO-1842",
  dispatchStatus: "en_route",
  photos: [
    { assetId: "photo-meter-before", caption: "Meter before service" },
    { assetId: "photo-panel-after", caption: "Panel after service" }
  ],
  technician: { id: "tech-27", followUpChannel: "dispatch" },
});

const result = await runLeakedKeyDrill(input, infraiFromEnvironment(), randomUUID());
console.log(JSON.stringify(result, null, 2));
