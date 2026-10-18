type EdgeRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

// Keep this Edge Function dependency-free so editors without Deno's npm: resolver
// can still type-check it. Supabase's Edge Runtime provides Deno at runtime.
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

function serviceHeaders(secretKey: string | undefined, serviceRoleKey: string | undefined) {
  const privilegedKey = secretKey || serviceRoleKey!;
  const headers = new Headers({
    apikey: privilegedKey,
    "Content-Type": "application/json",
  });
  // New sb_secret keys must be sent only as apikey. Legacy service_role keys
  // are JWTs and continue to work in the Authorization header.
  if (!secretKey) headers.set("Authorization", `Bearer ${privilegedKey}`);
  return headers;
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
      return json({ error: "Admin provisioning is not configured on the server." }, 500);
    }

    const callerResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!callerResponse.ok) return json({ error: "Your session is invalid. Sign in again." }, 401);
    const caller = await callerResponse.json();
    if (!caller?.id) return json({ error: "Your session is invalid. Sign in again." }, 401);

    const headers = serviceHeaders(secretKey, serviceRoleKey);
    const roleUrl = new URL(`${url}/rest/v1/user_roles`);
    roleUrl.searchParams.set("select", "role");
    roleUrl.searchParams.set("user_id", `eq.${caller.id}`);
    // Use the same verified JWT that identified the caller. FindBack's RLS
    // grants dashboard roles permission to read user_roles, including their
    // own role, and this avoids depending on Edge Function secret-key format.
    const roleResponse = await fetch(roleUrl, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
    });
    if (!roleResponse.ok) {
      const lookupError = await roleResponse.text();
      console.error("create-admin role lookup failed:", roleResponse.status, lookupError);
      return json({ error: `Could not verify administrator permissions (role lookup returned HTTP ${roleResponse.status}). Refresh the page and sign in again.` }, 503);
    }
    const callerRoles = await roleResponse.json();
    const callerRole = callerRoles[0]?.role;
    if (!["super_admin", "president"].includes(callerRole)) {
      return json({ error: "Only a Super Admin or President can add administrators." }, 403);
    }
    const body = await req.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = body.role === "super_admin" ? "super_admin" : "admin";
    if (role === "super_admin" && callerRole !== "president") {
      return json({ error: "Only the President can create Super Admins." }, 403);
    }
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return json({ error: "Enter a name, valid email, and password of at least 8 characters." }, 400);
    }
    if (["govind-admin@findback.com", "govindpandit295@gmail.com"].includes(email)) {
      return json({ error: "A protected leadership account cannot be reassigned." }, 400);
    }

    const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });
    const created = await createResponse.json();
    if (!createResponse.ok || !created?.id) {
      return json({ error: created?.msg || created?.message || "Could not create the account." }, 400);
    }

    const promoteHeaders = new Headers(headers);
    promoteHeaders.set("Prefer", "resolution=merge-duplicates,return=minimal");
    const promoteResponse = await fetch(`${url}/rest/v1/user_roles?on_conflict=user_id`, {
      method: "POST",
      headers: promoteHeaders,
      body: JSON.stringify({ user_id: created.id, role }),
    });
    if (!promoteResponse.ok) {
      await fetch(`${url}/auth/v1/admin/users/${created.id}`, { method: "DELETE", headers });
      return json({ error: "Account creation failed while assigning the admin rank." }, 500);
    }

    return json({ ok: true, userId: created.id, role }, 201);
  } catch (error) {
    console.error("create-admin failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Could not create administrator." }, 500);
  }
});
