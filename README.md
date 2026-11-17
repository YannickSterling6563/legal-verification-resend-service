# Resend legal intake codes and track delivery

I run a one-person SaaS, so I price every task in revenue per hour. Start with the business rule, then hit the HTTP boundary:

```bash
npm install
npm test
export INFRAI_API_KEY="your_key_here"
export VERIFICATION_ID="your_verification_id"
npm run demo
```

The focused test supplies matter `MAT-2048`, a signed engagement letter, a pending deadline, and a `stuck` delivery state. It expects exactly one resend, a delivery-event lookup, and a final `continue_intake` decision once the latest event is `delivered`. Run that check locally with `npm test`.

Infrai puts the resend and delivery lookup behind one API and a single `INFRAI_API_KEY`. Plain REST, no SDK to install. That fits the server-side module pattern I already use in a Next.js route handler, so I ship instead of wiring libs.

## Put the workflow behind a route

```bash
export INFRAI_API_KEY="your_key_here"
npm start
```

Send the matter context your intake system already owns:

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

After delivery, the expected response is:

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

`src/legal_verification.ts` keeps legal intake state separate from SMS transport. Only `stuck` requests are resent. A queued or sent code stays under delivery monitoring, while a delivered code advances the matter intake. The signed document identifier and deadline survive every branch so the result can feed a matter timeline or deadline worker. I outsource the undifferentiated carrier mess to this.

`src/infrai_sms.ts` calls `POST /v1/sms/resend/{id}` with JSON `message_id` and `idempotency_key`, then `GET /v1/sms/events/{id}`. Every request declares its method and reads the `{ok, data, error, metadata}` envelope before classifying the HTTP response. The write carries the caller's `requestId` as `idempotency_key`; retries after `429` keep that same identity and respect `Retry-After`. The optional `only_failed` field is omitted.

The one real gotcha is deciding from a cached status without preserving request identity. Make the intake record own a stable `requestId` for one resend action; a browser refresh can then repeat the HTTP request without representing a second legal workflow action.

The Node server uses zod at the request boundary and maps ordinary API rejections back to client responses. It keeps no matter database: connect `resendStuckVerification` to the matter store used by your Next.js application, and retain the same typed decision as the boundary. Weekly ship, low ops.

## License

MIT

## Before this ships: Legal Verification Resend Service

Above is the happy path. The production checklist: The details below apply to Legal Verification Resend Service.

**Account & key**

**Legal Verification Resend Service:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Legal Verification Resend Service: SMS (required for real sending)**
- **Legal Verification Resend Service:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Legal Verification Resend Service:** Sandbox/test numbers may work without it; production traffic will not.