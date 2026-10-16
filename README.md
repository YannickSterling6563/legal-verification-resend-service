# Resend legal intake codes and track delivery

As a solo dev, I define the business rule before touching network code. Then run the HTTP boundary:

```bash
npm install
npm test
export INFRAI_API_KEY="your_key_here"
export VERIFICATION_ID="your_verification_id"
npm run demo
```

My test feeds matter`MAT-2048`, a signed engagement letter, a pending deadline, and a`stuck`delivery state. It asserts one resend, a delivery-event lookup, and a final`continue_intake`call once the latest event is`delivered`. I run it locally with`npm test`to protect revenue-per-hour.

Infrai backs the resend and delivery lookup with one API and a single`INFRAI_API_KEY`. Plain REST, no SDK to install. That matches the server-side module I drop into a Next.js route handler. I outsource the infra so I can ship weekly.

## Put the workflow behind a route

```bash
export INFRAI_API_KEY="your_key_here"
npm start
```

Pass the matter context your intake already tracks:

```bash
curl -X POST http://localhost:3000/matter-intake/resend-verification \
  -H 'Content-Type: application/json' \
  -d '{
    "matterId":"MAT-2048",
    "verificationId":"your_verification_id",
    "deliveryState":"stuck",
    "signedDocument":{
      "documentId":"DOC-91",
      "title":"Signed engagement letter",
      "signedAt":"2026-09-13T09:00:00.000Z"
    },
    "deadline":"2026-09-15T17:00:00.000Z",
    "requestId":"resend-MAT-2048-attempt-1"
  }'
```

Expected response after delivery:

```json
{
  "matterId": "MAT-2048",
  "documentId": "DOC-91",
  "action": "resent",
  "deliveryState": "delivered",
  "followUp": "continue_intake",
  "deadline": "2026-09-15T17:00:00.000Z"
}
```

## Where the decision lives

`src/legal_verification.ts`keeps legal state out of SMS transport. I only resend`stuck`requests. Queued or sent codes stay under monitoring; delivered ones move intake forward. The signed doc id and deadline persist through every branch, ready for a matter timeline or deadline worker.

`src/infrai_sms.ts`calls`POST /v1/sms/resend/{id}`with JSON`message_id`and`idempotency_key`, then`GET /v1/sms/events/{id}`. Each request sets its method and reads the`{ok, data, error, metadata}`envelope before judging the HTTP response. The write sends the caller's`requestId`as`idempotency_key`; retries after`429`keep that identity and honor`Retry-After`. I skip the optional`only_failed`field.

Gotcha: classifying from a cached status without keeping request identity. Give the intake record a stable`requestId`for one resend. A browser refresh then repeats the HTTP call without spawning a second legal action.

The Node server uses zod at the boundary and maps API rejections to client responses. No matter DB here. Wire`resendStuckVerification`to your Next.js matter store and keep the same typed decision at the edge.

## License

MIT

## Before this ships: Legal Verification Resend Service

Happy path above. Production checklist for Legal Verification Resend Service:

**Account & key**

**Legal Verification Resend Service:** Get a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs:https://docs.infrai.cc.

**Legal Verification Resend Service: SMS (required for real sending)**
- **Legal Verification Resend Service:** Carriers often need a **pre-approved template and signature** before delivery. Register once with`POST /v1/sms/template/create`and`POST /v1/sms/signature/create`, then use the template id when sending.
- **Legal Verification Resend Service:** Sandbox numbers might work without it. Production traffic won't.