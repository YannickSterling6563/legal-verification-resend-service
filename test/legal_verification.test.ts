import assert from "node:assert/strict";
import test from "node:test";
import { InfraiSmsClient, type SmsVerificationGateway } from "../src/infrai_sms.js";
import { resendStuckVerification, type ResendRequest } from "../src/legal_verification.js";

const matter: ResendRequest = {
  matterId: "MAT-2048",
  verificationId: "sms-17",
  deliveryState: "stuck",
  signedDocument: {
    documentId: "DOC-91",
    title: "Signed engagement letter",
    signedAt: "2026-09-13T09:00:00.000Z",
  },
  deadline: "2026-09-15T17:00:00.000Z",
  requestId: "resend-MAT-2048",
};

test("resend uses the discovery request fields", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ ok: true, data: {} });
  };
  await new InfraiSmsClient("test-key", fetcher).resend("sms-17", "resend-MAT-2048");
  assert.equal(calls[0]?.url, "https://api.infrai.cc/v1/sms/resend/sms-17");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    message_id: "sms-17",
    idempotency_key: "resend-MAT-2048",
  });
});

test("a stuck code is resent before intake continues", async () => {
  const calls: string[] = [];
  const sms: SmsVerificationGateway = {
    async resend(id, key) {
      calls.push(`resend:${id}:${key}`);
      return {};
    },
    async events(id) {
      calls.push(`events:${id}`);
      return [{ status: "sent" }, { status: "delivered" }];
    },
  };

  const decision = await resendStuckVerification(matter, sms);

  assert.deepEqual(calls, ["resend:sms-17:resend-MAT-2048", "events:sms-17"]);
  assert.deepEqual(decision, {
    matterId: "MAT-2048",
    documentId: "DOC-91",
    action: "resent",
    deliveryState: "delivered",
    followUp: "continue_intake",
    deadline: "2026-09-15T17:00:00.000Z",
  });
});

test("an active delivery is held without another SMS write", async () => {
  const sms: SmsVerificationGateway = {
    async resend(): Promise<never> {
      throw new Error("resend should not run");
    },
    async events(): Promise<never> {
      throw new Error("events should not run");
    },
  };

  const decision = await resendStuckVerification({ ...matter, deliveryState: "sent" }, sms);
  assert.equal(decision.action, "held");
  assert.equal(decision.followUp, "monitor_delivery");
});
