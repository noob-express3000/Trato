export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const csrf = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('csrf_token='))
    ?.split('=')[1];
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}),
      ...(init?.headers || {})
    }
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}
