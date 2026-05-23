// Shared CRON_SECRET check for /api/public/hooks/* endpoints.
// Returns a 401 Response when the request is unauthorized, otherwise null.
export function requireCronSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (!secret || !provided || provided !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
