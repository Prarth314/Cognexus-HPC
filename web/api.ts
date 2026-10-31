let sessionEpoch = 0;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function endSession() {
  sessionEpoch++;
  window.dispatchEvent(new Event('cognexus:session-ended'));
}
export function startSession() {
  sessionEpoch++;
}
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const epoch = sessionEpoch;
  const form = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${url}`, {
      ...options,
      credentials: 'same-origin',
      signal: options.signal || AbortSignal.timeout(30000),
      headers: {
        'x-cognexus-request': '1',
        ...(!form && options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Cannot reach the Cognexus service. Check your connection and try again.',
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error:
        response.status >= 500
          ? 'The Cognexus service is starting or unavailable. Try again shortly.'
          : 'The server did not return a valid API response.',
    }))) as {
      error?: string;
      details?: { path: string; message: string }[];
    };
    if (epoch !== sessionEpoch) throw new ApiError('Session changed; request discarded', 401);
    if (
      response.status === 401 &&
      response.headers.get('x-cognexus-session') === 'expired' &&
      !url.startsWith('/auth/') &&
      url !== '/metrics'
    )
      endSession();
    throw new ApiError(
      body.details?.map((item) => `${item.path}: ${item.message}`).join('; ') ||
        body.error ||
        `Request failed (${response.status})`,
      response.status,
    );
  }
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new ApiError(
      'This page cannot connect to the Cognexus backend. A static website alone cannot run the research service.',
      502,
    );
  }
  if (epoch !== sessionEpoch) throw new ApiError('Session changed; request discarded', 401);
  return data;
}
export async function loadSession<T>(): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<T>('/session');
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        ![0, 500, 502, 503, 504].includes(error.status) ||
        attempt >= 4
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}
export const json = (value: unknown) => JSON.stringify(value);
export const formatDate = (date: string) =>
  new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
export const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
