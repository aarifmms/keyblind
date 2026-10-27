import { NextResponse } from "next/server";
import { getOrgBilling } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { org, user } = await requireOrgRole(["owner"]);
    const priceId = process.env.STRIPE_TEAM_PRICE_ID;
    if (!priceId) throw new ApiError("STRIPE_TEAM_PRICE_ID is not configured", 500);

    const billing = await getOrgBilling(org.id);
    if (billing.plan !== "free") {
      throw new ApiError("Already subscribed. Manage your plan in the billing portal.", 400);
    }

    const quantity = Math.max(1, billing.seatCount);
    const stripe = getStripe();
    const origin = new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity }],
      customer_email: user.email,
      success_url: `${origin}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/billing`,
      metadata: { org_id: org.id, quantity: String(quantity) },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/billing/checkout failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
