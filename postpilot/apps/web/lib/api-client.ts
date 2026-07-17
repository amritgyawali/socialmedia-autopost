export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorPayload {
  message?: string;
  detail?: string;
  error?: string;
  details?: unknown;
  errors?: unknown;
}

function formatValidationErrors(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([field, issue]) => {
      const text = Array.isArray(issue) ? issue.join(", ") : String(issue);
      return `${field}: ${text}`;
    }).join(" · ");
  }
  return String(value);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/engine${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const error = (payload ?? {}) as ErrorPayload;
    const validation = formatValidationErrors(error.errors ?? error.details);
    const baseMessage = error.message || error.detail || error.error || `The engine returned ${response.status}.`;
    throw new ApiError(
      validation ? `${baseMessage} ${validation}` : baseMessage,
      response.status,
      error.details,
    );
  }

  return payload as T;
}

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "The engine rejected this request. Check its shared authentication secret.";
    if (error.status === 404) return "That item no longer exists. Refresh and try again.";
    if (error.status === 409) return error.message || "This item changed elsewhere. Refresh and try again.";
    if (error.status >= 500) return "The publishing engine is unavailable right now. Your draft is still safe.";
    return error.message;
  }
  if (error instanceof TypeError) return "Could not reach the cockpit server. Check your connection and try again.";
  if (error instanceof Error) return error.message;
  return "Something unexpected happened. Please try again.";
}
