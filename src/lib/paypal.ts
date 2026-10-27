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

export async function createPayPalOrder(orderId: string, urls?: { returnUrl?: string; cancelUrl?: string }) {
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
            value: process.env.SONG_PRICE_USD || "9.99",
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

export async function capturePayPalOrder(paypalOrderId: string) {
  const token = await paypalAccessToken();
  const orderUrl = paypalBaseUrl() + "/v2/checkout/orders/" + encodeURIComponent(paypalOrderId);
  const response = await fetch(orderUrl + "/capture", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: "{}",
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    purchase_units?: Array<{ custom_id?: string }>;
    message?: string;
    details?: Array<{ issue?: string; description?: string }>;
  };

  // PayPal rejects a second capture for an already completed order. Treat
  // that case as idempotent by reading the order's final state.
  let completedPayload = payload;
  if (!response.ok || payload.status !== "COMPLETED") {
    const currentResponse = await fetch(orderUrl, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    });
    const currentPayload = (await currentResponse.json()) as typeof payload;
    if (currentResponse.ok && currentPayload.status === "COMPLETED") {
      completedPayload = currentPayload;
    } else {
      const detail = payload.details?.[0]?.issue || payload.details?.[0]?.description;
      throw new Error(
        "PayPal payment was not completed: " +
          (payload.message || detail || payload.status || response.status),
      );
    }
  }

  if (completedPayload.status !== "COMPLETED") {
    throw new Error(
      "PayPal payment was not completed: " + completedPayload.status,
    );
  }
  const orderId = completedPayload.purchase_units?.[0]?.custom_id;
  if (!orderId) throw new Error("PayPal payment did not include a SongGift order.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("song_orders")
    .update({ status: "paid", paypal_order_id: completedPayload.id, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw new Error("Could not record PayPal payment: " + error.message);
  return { orderId, paypalOrderId: payload.id };
}
