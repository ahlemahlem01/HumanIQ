const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api";

export function mediaUrl(path: string) {
  const origin = API.replace(/\/api\/?$/, "");
  return `${origin}${path}`;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(payload.message)
      ? payload.message.join(" ")
      : payload.message || "Une erreur est survenue.";
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Multipart upload — the browser must set its own boundary, so no Content-Type here. */
export async function upload<T>(
  path: string,
  file: File,
  options: { token?: string | null; field?: string } = {},
): Promise<T> {
  const body = new FormData();
  body.append(options.field ?? "file", file);

  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : undefined,
    body,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(payload.message)
      ? payload.message.join(" ")
      : payload.message || "Téléversement impossible.";
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export const STAGE_LABEL: Record<string, string> = {
  SOURCING: "Sourcing",
  PRESELECTION: "Présélection",
  INTERVIEW: "Entretien",
  TEST: "Test",
  OFFER: "Offre",
  HIRED: "Engagé",
  REJECTED: "Refusé",
};
