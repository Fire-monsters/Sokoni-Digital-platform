import { createClient } from '@supabase/supabase-js'

const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const financeAuth = supabaseUrl && publishableKey
  ? createClient(supabaseUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null
const MEMBER_SESSION = 'sokoni-warehouse-member-session'

type MemberSession = { accessToken: string; refreshToken: string; expiresAt: number | null }
export type WarehouseBusiness = { id: string; kind: string; status: string; name: string }
export type CatalogueItem = {
  id: string; warehouse_business_id: string; product_id: string; sku: string; name: string;
  grade: string; package_unit: string; base_unit: string; units_per_package: number;
  price_ugx_per_package: number; minimum_packages: number; available_packages: number;
  status: string; version: number;
}
export type Order = {
  id: string; reference: string; status: string; totalUgx: number; createdAt: string;
  notes: string | null; lines: Array<{ id: string; name: string; grade: string;
    quantityPackages: number; packageUnit: string; unitPriceUgx: number; lineTotalUgx: number }>;
  invoice: null | { id: string; reference: string; totalUgx: number;
    paidUgx: number; balanceUgx: number; documentStatus: string };
  history: Array<{ status: string; at: string; reason: string | null }>;
}
export type FinanceInvoice = { id: string; reference: string; orderId: string;
  totalUgx: number; paidUgx: number; balanceUgx: number; issuedAt: string }

function readMember(): MemberSession | null {
  try { return JSON.parse(sessionStorage.getItem(MEMBER_SESSION) ?? 'null') as MemberSession | null }
  catch { return null }
}

export async function signInMember(phoneNumber: string, password: string) {
  const response = await fetch(`${apiOrigin}/v1/business-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, password }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.success !== true) throw new Error(result?.error?.message ?? 'Sign-in failed.')
  sessionStorage.setItem(MEMBER_SESSION, JSON.stringify(result.data))
}

export async function signInFinance(email: string, password: string) {
  if (!financeAuth) throw new Error('Finance authentication is not configured.')
  const { error } = await financeAuth.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut(mode: 'member' | 'finance') {
  if (mode === 'member') {
    const session = readMember()
    if (session) {
      await fetch(`${apiOrigin}/v1/business-auth/logout`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}` },
      }).catch(() => undefined)
    }
    sessionStorage.removeItem(MEMBER_SESSION)
  } else await financeAuth?.auth.signOut()
}

async function token(mode: 'member' | 'finance') {
  if (mode === 'finance') {
    const { data } = await financeAuth?.auth.getSession() ?? { data: { session: null } }
    if (!data.session) throw new Error('Finance sign-in required.')
    return data.session.access_token
  }
  let session = readMember()
  if (!session) throw new Error('Warehouse sign-in required.')
  if (session.expiresAt && session.expiresAt * 1000 < Date.now() + 60_000) {
    const response = await fetch(`${apiOrigin}/v1/business-auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.success !== true) throw new Error('Warehouse session expired. Sign in again.')
    session = result.data as MemberSession
    sessionStorage.setItem(MEMBER_SESSION, JSON.stringify(session))
  }
  return session.accessToken
}

export async function request<T>(path: string, mode: 'member' | 'finance', init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init, cache: 'no-store', headers: {
      Authorization: `Bearer ${await token(mode)}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers,
    },
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.success !== true)
    throw new Error(result?.error?.message ?? `Request failed (${response.status}).`)
  return result.data as T
}

export async function approvedWarehouse() {
  const businesses = await request<WarehouseBusiness[]>('/v1/me/businesses', 'member')
  const warehouse = businesses.find((business) => business.kind === 'warehouse' && business.status === 'approved')
  if (!warehouse) throw new Error('An approved warehouse membership is required.')
  return warehouse
}
export async function catalogue(warehouseId: string) {
  return request<CatalogueItem[]>(`/v1/warehouse/businesses/${warehouseId}/wholesale/catalogue`, 'member')
}
export async function orders(warehouseId: string) {
  return request<Order[]>(`/v1/warehouse/businesses/${warehouseId}/wholesale/orders`, 'member')
}
export async function financeInvoices() {
  return request<FinanceInvoice[]>('/v1/finance/wholesale/invoices', 'finance')
}
export async function pdfUrl(invoiceId: string, mode: 'member' | 'finance') {
  const result = await request<{ url: string }>(`/v1/wholesale/invoices/${invoiceId}/pdf`, mode)
  return result.url
}
