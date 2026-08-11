// Vercel serverless function. Deployed at /api/claude — this is what the frontend calls instead
// of hitting api.anthropic.com directly. The real API key lives ONLY here, as a server
// environment variable (set it in your Vercel project settings, never in frontend code).
//
// This is the actual fix for "AI features stop working after the daily limit" — that error
// was coming from the shared claude.ai account's personal usage window. A real Anthropic API
// key from https://console.anthropic.com has its own separate billing and much higher limits,
// scaled to what you're willing to pay for as the app owner.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // TODO once you have real user accounts wired up: verify the requester's Supabase session
  // token here, and consider a simple per-user request counter (e.g. a Supabase table) so one
  // heavy user can't run up your bill for everyone else.

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: "Proxy request failed" } });
  }
}
