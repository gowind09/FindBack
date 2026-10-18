type EdgeRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const edgeRuntime = (globalThis as typeof globalThis & { Deno: EdgeRuntime }).Deno;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

edgeRuntime.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sign in as a Super Admin or President first." }, 401);

  try {
    const url = edgeRuntime.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(edgeRuntime.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const publishableKey = publishableKeys.default || edgeRuntime.env.get("SUPABASE_ANON_KEY");
    const secretKeys = JSON.parse(edgeRuntime.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const secretKey = secretKeys.default;
    const serviceRoleKey = edgeRuntime.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishableKey || (!secretKey && !serviceRoleKey)) {
      return json({ error: "Admin management is not configured on the server." }, 500);
    }

    const callerResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!callerResponse.ok) return json({ error: "Your session is invalid. Sign in again." }, 401);
    const caller = await callerResponse.json();
    if (!caller?.id) return json({ error: "Your session is invalid. Sign in again." }, 401);

    const headers = new Headers({
      apikey: secretKey || serviceRoleKey!,
      "Content-Type": "application/json",
    });
    if (!secretKey) headers.set("Authorization", `Bearer ${serviceRoleKey}`);
    const roleUrl = new URL(`${url}/rest/v1/user_roles`);
    roleUrl.searchParams.set("select", "role");
    roleUrl.searchParams.set("user_id", `eq.${caller.id}`);
    const callerRoleResponse = await fetch(roleUrl, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!callerRoleResponse.ok) {
      const lookupError = await callerRoleResponse.text();
      console.error("remove-admin caller role lookup failed:", callerRoleResponse.status, lookupError);
      return json({ error: `Could not verify administrator permissions (role lookup returned HTTP ${callerRoleResponse.status}). Refresh the page and sign in again.` }, 503);
    }
    const callerRoles = await callerRoleResponse.json();
    const callerRole = callerRoles[0]?.role;
    if (!["super_admin", "president"].includes(callerRole)) {
      return json({ error: "Only a Super Admin or President can remove administrators." }, 403);
    }

    const body = await req.json();
    const userId = String(body.userId || "");
    if (!userId || userId === caller.id) return json({ error: "Choose another admin account to remove." }, 400);

    const targetUrl = new URL(`${url}/rest/v1/user_roles`);
    targetUrl.searchParams.set("select", "user_id,role");
    targetUrl.searchParams.set("user_id", `eq.${userId}`);
    const targetResponse = await fetch(targetUrl, { headers });
    const targetRoles = targetResponse.ok ? await targetResponse.json() : [];
    const targetRole = targetRoles[0]?.role;
    if (!targetResponse.ok || !["admin", "super_admin"].includes(targetRole)) {
      return json({ error: "This account cannot be removed from admin management." }, 400);
    }
    if (targetRole === "super_admin" && callerRole !== "president") {
      return json({ error: "Only the President can remove a Super Admin." }, 403);
    }

    const updateUrl = new URL(`${url}/rest/v1/user_roles`);
    updateUrl.searchParams.set("user_id", `eq.${userId}`);
    const updateHeaders = new Headers(headers);
    updateHeaders.set("Prefer", "return=minimal");
    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: updateHeaders,
      body: JSON.stringify({ role: targetRole === "super_admin" ? "admin" : "user" }),
    });
    if (!updateResponse.ok) return json({ error: "Could not remove admin access." }, 500);
    return json({ ok: true, userId });
  } catch (error) {
    console.error("remove-admin failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Could not remove admin access." }, 500);
  }
});
