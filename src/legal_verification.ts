import { z } from "zod";
import type { DeliveryEvents, SmsVerificationGateway } from "./infrai_sms.js";

export const resendRequestSchema = z.object({
  matterId: z.string().min(1),
  verificationId: z.string().min(1),
  deliveryState: z.enum(["queued", "sent", "delivered", "stuck"]),
  signedDocument: z.object({
    documentId: z.string().min(1),
    title: z.string().min(1),
    signedAt: z.string().datetime(),
  }),
  deadline: z.string().datetime(),
  requestId: z.string().min(8),
});

export type ResendRequest = z.infer<typeof resendRequestSchema>;
export type ResendDecision = {
  matterId: string;
  documentId: string;
  action: "held" | "resent";
  deliveryState: string;
  followUp: "monitor_delivery" | "continue_intake";
  deadline: string;
};

function latestDeliveryState(events: DeliveryEvents): string {
  if (!Array.isArray(events)) {
    return typeof events.status === "string" ? events.status : "resent";
  }
  const latest = events.at(-1);
  return latest && typeof latest === "object" && "status" in latest && typeof latest.status === "string"
    ? latest.status
    : "resent";
}

export async function resendStuckVerification(
  input: ResendRequest,
  sms: SmsVerificationGateway,
): Promise<ResendDecision> {
  if (input.deliveryState !== "stuck") {
    return {
      matterId: input.matterId,
      documentId: input.signedDocument.documentId,
      action: "held",
      deliveryState: input.deliveryState,
      followUp: input.deliveryState === "delivered" ? "continue_intake" : "monitor_delivery",
      deadline: input.deadline,
    };
  }

  await sms.resend(input.verificationId, input.requestId);
  const deliveryState = latestDeliveryState(await sms.events(input.verificationId));
  return {
    matterId: input.matterId,
    documentId: input.signedDocument.documentId,
    action: "resent",
    deliveryState,
    followUp: deliveryState === "delivered" ? "continue_intake" : "monitor_delivery",
    deadline: input.deadline,
  };
}
