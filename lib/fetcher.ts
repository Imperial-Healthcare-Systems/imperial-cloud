/**
 * Tiny client-side fetch wrapper that understands the API envelope.
 * Throws on error so callers can use try/catch + toast.
 */
export interface ApiOk<T> { ok: true; data: T }
export interface ApiErr { ok: false; error: { code: string; message: string; details?: unknown } }

export class ApiError extends Error {
  code: string
  status: number
  details: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status; this.code = code; this.details = details
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  let body: ApiOk<T> | ApiErr | null = null
  try { body = await res.json() } catch { /* */ }
  if (!body) throw new ApiError(res.status, 'server_error', `Request failed (${res.status})`)
  if (body.ok) return body.data
  throw new ApiError(res.status, body.error.code, body.error.message, body.error.details)
}

export async function apiGet<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url, { cache: 'no-store' }))
}
export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return unwrap<T>(await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }))
}
export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  return unwrap<T>(await fetch(url, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }))
}
export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return unwrap<T>(await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }))
}
export async function apiDelete<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url, { method: 'DELETE' }))
}
