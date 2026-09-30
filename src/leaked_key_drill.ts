import { z } from "zod";
import type { InfraiClient } from "./infrai_client.js";

export const drillRequestSchema = z.object({
  workOrderId: z.string().min(1),
  dispatchStatus: z.enum(["assigned", "en_route", "on_site", "completed"]),
  photos: z.array(z.object({
    assetId: z.string().min(1),
    caption: z.string().min(1),
  })).min(1),
  technician: z.object({
    id: z.string().min(1),
    followUpChannel: z.enum(["phone", "sms", "dispatch"]),
  }),
});

export type DrillRequest = z.infer<typeof drillRequestSchema>;

export type DispatchDecision = {
  dispatchStatus: DrillRequest["dispatchStatus"] | "held_for_review";
  technicianFollowUp: "required" | "not_required";
  exposedLogMatches: number;
};

export function decideDispatch(exposedLogMatches: number, current: DrillRequest["dispatchStatus"]): DispatchDecision {
  return exposedLogMatches > 0
    ? { dispatchStatus: "held_for_review", technicianFollowUp: "required", exposedLogMatches }
    : { dispatchStatus: current, technicianFollowUp: "not_required", exposedLogMatches };
}

function countTextMatches(value: unknown, needle: string): number {
  if (typeof value === "string") return value.includes(needle) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countTextMatches(item, needle), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce<number>((sum, item) => sum + countTextMatches(item, needle), 0);
  }
  return 0;
}

export async function runLeakedKeyDrill(
  input: DrillRequest,
  infrai: InfraiClient,
  drillId: string,
) {
  const temporaryKey = await infrai.createDrillKey(`${drillId}:create`);
  await infrai.reportCompromise(temporaryKey.id);

  const logs = await infrai.searchRecentLogs();
  const exposedLogMatches = countTextMatches(logs, temporaryKey.id);
  const rotatedKey = await infrai.rotateDrillKey(temporaryKey.id, `${drillId}:rotate`);
  const decision = decideDispatch(exposedLogMatches, input.dispatchStatus);

  return {
    drillId,
    workOrderId: input.workOrderId,
    photoAssetsReviewed: input.photos.map((photo) => photo.assetId),
    technicianId: input.technician.id,
    followUpChannel: input.technician.followUpChannel,
    report: "confirmed",
    rotation: {
      keyId: rotatedKey.id,
      replacementKey: rotatedKey.key,
      graceHours: 1,
    },
    confirmation: decision,
  };
}
