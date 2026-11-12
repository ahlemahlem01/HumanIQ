/**
 * Security settings that depend on the environment.
 *
 * In development everything stays permissive so `npm run start:dev` works without setup.
 * In production (NODE_ENV=production) the API only answers the configured front-end(s) and rate limiting is on.
 */

export const isProduction = () => process.env.NODE_ENV === "production";

/**
 * When an e-mail cannot be sent, development hands the secret link back in the API response so you can click it.
 * That must never happen in production: anyone could then read another person's reset or verification link.
 */
export const exposeFallbackLinks = () => !isProduction();

/** Rate limiting is on in production, or anywhere when THROTTLE_ENABLED=true. Off by default in development and tests. */
export const throttlingEnabled = () => isProduction() || process.env.THROTTLE_ENABLED === "true";

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);

/** Origins allowed to call the API from a browser: FRONTEND_URL (one or several, comma separated). */
export function allowedOrigins() {
  const configured = list(process.env.FRONTEND_URL);
  return configured.length ? configured : isProduction() ? [] : ["http://localhost:3100"];
}

/**
 * Chrome extensions to accept, by origin (chrome-extension://<id>), comma separated in EXTENSION_ORIGINS.
 * Outside production any extension is accepted, so loading it unpacked just works.
 */
export function allowedExtensionOrigins() {
  return list(process.env.EXTENSION_ORIGINS);
}

export function isOriginAllowed(origin: string | undefined) {
  if (!origin) return true; // same-origin, server-to-server and curl: no CORS involved
  const clean = origin.replace(/\/$/, "");
  if (allowedOrigins().includes(clean)) return true;
  if (clean.startsWith("chrome-extension://")) return !isProduction() || allowedExtensionOrigins().includes(clean);
  if (!isProduction() && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(clean)) return true;
  return false;
}

/** Number of reverse proxies in front of the API (so the client IP is read correctly for rate limiting). */
export function trustedProxies() {
  const value = process.env.TRUST_PROXY;
  if (value !== undefined && value !== "") return Number(value) || 0;
  return isProduction() ? 1 : 0;
}
