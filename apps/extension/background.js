const DEFAULT_API = "http://localhost:4100/api";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
  return true;
});

async function handle(message) {
  const stored = await chrome.storage.local.get(["token", "apiBase"]);
  const apiBase = (stored.apiBase || DEFAULT_API).replace(/\/$/, "");

  if (message.type === "LOGIN") {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: message.email, password: message.password }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.message || "Connexion impossible.");
    if (payload.user?.role !== "RECRUITER") throw new Error("Connectez-vous avec un compte recruteur.");
    await chrome.storage.local.set({ token: payload.token, apiBase });
    return { user: payload.user };
  }

  if (message.type === "LOGOUT") {
    await chrome.storage.local.remove(["token"]);
    return { ok: true };
  }

  if (!stored.token) throw new Error("Non connecté.");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${stored.token}`,
  };

  if (message.type === "JOBS") {
    const res = await fetch(`${apiBase}/jobs/mine`, { headers });
    if (res.status === 401) throw new Error("Session expirée.");
    if (!res.ok) throw new Error("Impossible de charger les offres.");
    return { jobs: await res.json() };
  }

  if (message.type === "IMPORT") {
    const res = await fetch(`${apiBase}/sourcing/linkedin`, {
      method: "POST",
      headers,
      body: JSON.stringify(message.payload),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(" ") : payload.message || "Import impossible.");
    return { application: payload };
  }

  throw new Error("Action inconnue.");
}
