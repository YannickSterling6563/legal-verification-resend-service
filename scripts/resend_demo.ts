import { smsFromEnvironment } from "../src/infrai_sms.js";
import { resendStuckVerification } from "../src/legal_verification.js";

const verificationId = process.env.VERIFICATION_ID;
if (!verificationId) throw new Error("VERIFICATION_ID is required");

const result = await resendStuckVerification(
  {
    matterId: "MAT-2048",
    verificationId,
    deliveryState: "stuck",
    signedDocument: {
      documentId: "DOC-91",
      title: "Signed engagement letter",
      signedAt: "2026-09-13T09:00:00.000Z",
    },
    deadline: "2026-09-15T17:00:00.000Z",
    requestId: `matter-MAT-2048-${verificationId}`,
  },
  smsFromEnvironment(),
);

console.log(JSON.stringify(result, null, 2));
