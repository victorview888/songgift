import { getSupabaseAdmin } from "@/lib/supabase/admin";

function paypalBaseUrl() {
  return (process.env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const error = new Error(
      "PayPal needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET on the server.",
    );
    error.name = "ProviderConfigurationError";
    throw error;
  }
  return { clientId, clientSecret };
}

async function paypalAccessToken() {
  const { clientId, clientSecret } = paypalCredentials();
  const response = await fetch(paypalBaseUrl() + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("PayPal authentication failed (HTTP " + response.status + ").");
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("PayPal did not return an access token.");
  return payload.access_token;
}

export async function createPayPalOrder(orderId: string, priceUsd: string, urls?: { returnUrl?: string; cancelUrl?: string }) {
  const token = await paypalAccessToken();
  const response = await fetch(paypalBaseUrl() + "/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: orderId,
          description: "Personalized SongGift song",
          amount: {
            currency_code: process.env.PAYPAL_CURRENCY || "USD",
            value: priceUsd,
          },
        },
      ],
      application_context: {
        brand_name: process.env.PAYPAL_BRAND_NAME || "SongGift",
        user_action: "PAY_NOW",
        return_url: urls?.returnUrl || process.env.PAYPAL_RETURN_URL,
        cancel_url: urls?.cancelUrl || process.env.PAYPAL_CANCEL_URL,
      },
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    id?: string;
    links?: Array<{ rel?: string; href?: string }>;
    message?: string;
    details?: Array<{ issue?: string }>;
  };
  if (!response.ok || !payload.id) {
    throw new Error(
      "PayPal order creation failed: " +
        (payload.message || payload.details?.[0]?.issue || "HTTP " + response.status),
    );
  }
  const approvalUrl = payload.links?.find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) throw new Error("PayPal did not return an approval URL.");
  return { id: payload.id, approvalUrl };
}

export async function capturePayPalOrder(paypalOrderId: string, owner: { orderId: string; userId: string; priceUsd: string }) {
  const token = await paypalAccessToken();
  const url = paypalBaseUrl() + "/v2/checkout/orders/" + encodeURIComponent(paypalOrderId);
  type Payload = { id?: string; status?: string; purchase_units?: Array<{ custom_id?: string; amount?: {currency_code?: string; value?: string} }>; message?: string };
  const read = async () => {
    const response = await fetch(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error("Could not verify the PayPal order.");
    return await response.json() as Payload;
  };
  const assertMatches = (payload: Payload) => {
    const unit = payload.purchase_units?.[0];
    if (payload.id !== paypalOrderId || payload.purchase_units?.length !== 1 || unit?.custom_id !== owner.orderId || unit.amount?.currency_code !== (process.env.PAYPAL_CURRENCY || "USD") || Number(unit.amount.value) !== Number(owner.priceUsd)) throw new Error("PayPal payment does not match this song order.");
  };
  let payload = await read();
  assertMatches(payload);
  if (payload.status !== "COMPLETED") {
    const response = await fetch(url + "/capture", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": owner.orderId }, body: "{}", cache: "no-store" });
    if (!response.ok) {
      const current = await read();
      if (current.status !== "COMPLETED") throw new Error("PayPal payment was not completed. Please check your payment and try again.");
    }
    payload = await read();
  }
  assertMatches(payload);
  if (payload.status !== "COMPLETED") throw new Error("PayPal payment was not completed.");
  const db = getSupabaseAdmin();
  const { error } = await db.from("song_orders").update({ status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", owner.orderId).eq("user_id", owner.userId).eq("paypal_order_id", paypalOrderId).is("paid_at", null);
  if (error) throw new Error("Could not record PayPal payment: " + error.message);
  return { orderId: owner.orderId, paypalOrderId };
}
