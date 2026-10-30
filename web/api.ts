export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const form = options.body instanceof FormData;
  const response = await fetch(`/api${url}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'x-cognexus-request':'1', ...(!form && options.body ? { 'Content-Type':'application/json' } : {}), ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(()=>({ error:'Request failed' })) as { error?:string; details?:{ path:string;message:string }[] };
    throw new Error(body.details?.map(item=>`${item.path}: ${item.message}`).join('; ') || body.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export const json = (value: unknown) => JSON.stringify(value);
export const formatDate = (date: string) => new Date(date).toLocaleString(undefined,{ month:'short',day:'numeric',hour:'numeric',minute:'2-digit' });
export const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KiB` : `${(bytes/1024/1024).toFixed(1)} MiB`;
