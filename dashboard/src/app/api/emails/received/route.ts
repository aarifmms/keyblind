import crypto from "node:crypto";

// Resend signs webhooks with the svix scheme: HMAC-SHA256 over
// `${svix-id}.${svix-timestamp}.${rawBody}`, base64-encoded, prefixed with "v1,".
function verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestamp = parseInt(svixTimestamp, 10);
  if (Number.isNaN(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return false;
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(signedContent).digest("base64"),
    "base64",
  );

  for (const part of svixSignature.split(" ")) {
    if (!part.startsWith("v1,")) continue;
    const provided = Buffer.from(part.slice(3), "base64");
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const forwardTo = process.env.RESEND_FORWARD_TO;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!webhookSecret || !forwardTo || !resendApiKey) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers, webhookSecret)) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return Response.json({ received: true });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    return Response.json({ error: "Missing email_id" }, { status: 400 });
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey);
    const { data, error } = await resend.emails.receiving.forward({
      emailId,
      to: forwardTo,
      from: "Keyblind <license@keyblind.dev>",
    });

    if (error) {
      console.error("Resend forward failed:", JSON.stringify(error));
      return Response.json({ error: "Forward failed" }, { status: 500 });
    }

    console.log(`Forwarded inbound email ${emailId} to ${forwardTo} (${data?.id})`);
    return Response.json({ received: true, forwarded: data?.id });
  } catch (err: any) {
    console.error("Resend forward error:", err.message);
    return Response.json({ error: "Forward error" }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  return Response.json({ error: "Webhook endpoint — POST only" }, { status: 405 });
}
