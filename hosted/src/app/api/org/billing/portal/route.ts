import { NextResponse } from "next/server";
import { getOrgBilling } from "@/lib/org";
import { requireOrgRole, ApiError } from "@/lib/org-auth";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const { org } = await requireOrgRole(["owner"]);
    const billing = await getOrgBilling(org.id);
    if (!billing.stripeCustomerId) throw new ApiError("No subscription to manage", 400);

    const stripe = getStripe();
    const origin = new URL(req.url).origin;

    const session = await stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${origin}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("POST /api/org/billing/portal failed:", (err as Error).message);
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof ApiError ? err.message : "Server error" }, { status });
  }
}
