const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: Array<{ path: string; message: string }>,
    public data?: Record<string, any>
  ) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown };

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: opts.body
        ? { 'content-type': 'application/json' }
        : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      'network',
      'Cannot reach the server. Check your connection and try again.'
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('neocare:unauthenticated'));
    }

    throw new ApiError(
      res.status,
      data.error ?? 'error',
      data.message ?? 'Request failed',
      data.issues,
      data
    );
  }

  return data as T;
}

export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ?? {} });

export const patch = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body });