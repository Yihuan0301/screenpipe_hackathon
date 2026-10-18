const SCREENPIPE_BASE =
  process.env.NEXT_PUBLIC_SCREENPIPE_URL ??
  process.env.SCREENPIPE_LOCAL_API_URL ??
  "http://localhost:3030";

function getApiKey(): string | undefined {
  return (
    process.env.SCREENPIPE_API_KEY ||
    process.env.SCREENPIPE_LOCAL_API_KEY ||
    process.env.NEXT_PUBLIC_SCREENPIPE_API_KEY
  );
}

function authHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Screenpipe-Client": "api",
    "X-Screenpipe-Agent": "launch-shadow",
  };

  const key = getApiKey();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

export type ScreenpipeOcrItem = {
  type: string;
  content: {
    text?: string;
    timestamp?: string;
    app_name?: string;
    window_name?: string;
    frame_id?: number;
  };
};

export type ScreenpipeSearchResponse = {
  data: ScreenpipeOcrItem[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type SearchOcrOptions = {
  limit?: number;
  offset?: number;
  q?: string;
  app_name?: string;
  window_name?: string;
  start_time?: string;
  end_time?: string;
};

/**
 * Fetch OCR frames from the local Screenpipe REST API.
 * Requires Authorization: Bearer <key>
 * Get key: Screenpipe Desktop → Settings → Privacy, or `screenpipe auth token`
 */
export async function searchOcr(
  options: SearchOcrOptions = {}
): Promise<ScreenpipeSearchResponse> {
  const { limit = 10, offset = 0, q, app_name, window_name, start_time, end_time } =
    options;

  if (!getApiKey()) {
    throw new Error(
      "Missing SCREENPIPE_API_KEY. Set it in .env.local (see .env.local.example)."
    );
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    content_type: "ocr",
  });

  if (q) params.set("q", q);
  if (app_name) params.set("app_name", app_name);
  if (window_name) params.set("window_name", window_name);
  if (start_time) params.set("start_time", start_time);
  if (end_time) params.set("end_time", end_time);

  const url = `${SCREENPIPE_BASE}/search?${params.toString()}`;

  const res = await fetch(url, {
    headers: authHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Screenpipe OCR request failed: ${res.status} ${res.statusText}${
        body ? ` — ${body}` : ""
      }`
    );
  }

  return res.json() as Promise<ScreenpipeSearchResponse>;
}

/** Lightweight health ping against the local Screenpipe instance. */
export async function checkScreenpipeHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SCREENPIPE_BASE}/health`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
