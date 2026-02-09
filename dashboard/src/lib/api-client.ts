export type ApiClientResult<T> = {
  data?: T;
  status: number;
  error?: string;
};

type RequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

async function request<T>(
  method: "GET" | "POST",
  url: string,
  body?: string,
  options?: RequestOptions,
): Promise<ApiClientResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(options?.headers ?? {}),
      },
      body,
      signal: options?.signal,
      cache: "no-store",
    });

    const status = res.status;
    const contentType = res.headers.get("content-type") ?? "";

    const text = await res.text();

    if (!res.ok) {
      return { status, error: text || res.statusText };
    }

    if (contentType.includes("application/json")) {
      return { status, data: (text ? (JSON.parse(text) as T) : (undefined as T)) };
    }

    // ClickHouse and some endpoints return JSON but may omit content-type.
    try {
      return { status, data: (text ? (JSON.parse(text) as T) : (undefined as T)) };
    } catch {
      return { status, data: (text as unknown as T) };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed";
    return { status: 0, error: message };
  }
}

export const apiClient = {
  get<T>(url: string, options?: RequestOptions) {
    return request<T>("GET", url, undefined, options);
  },
  post<T>(url: string, body: string, options?: RequestOptions) {
    return request<T>("POST", url, body, options);
  },
};
