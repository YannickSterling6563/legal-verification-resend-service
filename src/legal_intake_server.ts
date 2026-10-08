import { createServer } from "node:http";
import { InfraiError, smsFromEnvironment } from "./infrai_sms.js";
import { resendRequestSchema, resendStuckVerification } from "./legal_verification.js";

const port = Number(process.env.PORT ?? 3000);
const sms = smsFromEnvironment();

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/matter-intake/resend-verification") {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    const parsed = resendRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Invalid request", issues: parsed.error.issues }));
      return;
    }
    const result = await resendStuckVerification(parsed.data, sms);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof InfraiError && error.status < 500 ? error.status : 502;
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
  }
});

server.listen(port, () => {
  console.log(`Legal intake service listening on http://localhost:${port}`);
});
