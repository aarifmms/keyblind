import type { WebhookEventPayload } from "resend";

export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const forwardTo = process.env.RESEND_FORWARD_TO;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!webhookSecret || !forwardTo || !resendApiKey) {
    return Response.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();

  const { Resend } = await import("resend");
  const resend = new Resend(resendApiKey);

  let event: WebhookEventPayload;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return Response.json({ received: true });
  }

  const emailId = event.data.email_id;
  if (!emailId) {
    return Response.json({ error: "Missing email_id" }, { status: 400 });
  }

  try {
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
