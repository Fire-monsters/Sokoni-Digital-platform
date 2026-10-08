'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  approvedWarehouse, catalogue, financeInvoices, orders, pdfUrl, request,
  signInFinance, signInMember, signOut,
  type CatalogueItem, type FinanceInvoice, type Order, type WarehouseBusiness,
} from '../lib/wholesale-client'

type View = 'Buyer orders' | 'Wholesale catalogue' | 'Finance'
type Crop = { id: string; name: string; slug: string }
const money = (value: number) => `UGX ${value.toLocaleString('en-UG')}`
const inputClass = 'h-10 w-full rounded-lg border border-[#d7e3d9] bg-white px-3 text-sm'
const buttonClass = 'rounded-lg bg-[#1f7a4d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'

export function WholesaleWorkspace({ view }: { view: View }) {
  const mode = view === 'Finance' ? 'finance' : 'member'
  const [business, setBusiness] = useState<WarehouseBusiness | null>(null)
  const [records, setRecords] = useState<Order[]>([])
  const [items, setItems] = useState<CatalogueItem[]>([])
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [identity, setIdentity] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [declineReason, setDeclineReason] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<CatalogueItem | null>(null)
  const [productId, setProductId] = useState('')
  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('A')
  const [packageUnit, setPackageUnit] = useState('bag')
  const [baseUnit, setBaseUnit] = useState('kg')
  const [unitsPerPackage, setUnitsPerPackage] = useState('50')
  const [price, setPrice] = useState('')
  const [minimum, setMinimum] = useState('1')
  const [available, setAvailable] = useState('')
  const [catalogueStatus, setCatalogueStatus] = useState('published')
  const [invoiceId, setInvoiceId] = useState('')
  const [provider, setProvider] = useState('')
  const [account, setAccount] = useState('')
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const operations = useRef<Record<string, string>>({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      if (mode === 'finance') {
        setInvoices(await financeInvoices())
        setSignedIn(true)
      } else {
        const warehouse = await approvedWarehouse()
        setBusiness(warehouse)
        setSignedIn(true)
        if (view === 'Buyer orders') setRecords(await orders(warehouse.id))
        else {
          const [offers, products] = await Promise.all([
            catalogue(warehouse.id), request<Crop[]>('/v1/agriculture/products', 'member'),
          ])
          setItems(offers)
          setCrops(products)
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load wholesale data.')
      setSignedIn(false)
    } finally { setLoading(false) }
  }
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WHOLESALE_ENABLED === 'true') void load()
    else setLoading(false)
  }, [view])

  async function login(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'finance') await signInFinance(identity, password)
      else await signInMember(identity, password)
      setPassword('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-in failed.') }
    finally { setBusy(false) }
  }
  async function logout() {
    await signOut(mode)
    setSignedIn(false)
    setBusiness(null)
    setRecords([])
    setInvoices([])
    setItems([])
  }
  async function act(order: Order, action: 'confirm' | 'decline') {
    if (!business) return
    const key = `${order.id}:${action}`
    operations.current[key] ??= crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      await request(`/v1/warehouse/businesses/${business.id}/wholesale/orders/${order.id}/${action}`,
        'member', { method: 'POST', body: JSON.stringify({ operationId: operations.current[key],
          ...(action === 'decline' ? { reason: declineReason[order.id] } : {}) }) })
      delete operations.current[key]
      setNotice(`Order ${order.reference} ${action === 'confirm' ? 'confirmed' : 'declined'}.`)
      setRecords(await orders(business.id))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Action failed.') }
    finally { setBusy(false) }
  }
  function edit(item: CatalogueItem) {
    setEditing(item)
    setProductId(item.product_id); setSku(item.sku); setName(item.name); setGrade(item.grade)
    setPackageUnit(item.package_unit); setBaseUnit(item.base_unit)
    setUnitsPerPackage(String(item.units_per_package)); setPrice(String(item.price_ugx_per_package))
    setMinimum(String(item.minimum_packages)); setAvailable(String(item.available_packages))
    setCatalogueStatus(item.status)
  }
  async function saveCatalogue(event: FormEvent) {
    event.preventDefault()
    if (!business) return
    setBusy(true); setError('')
    const key = `catalogue:${editing?.id ?? 'new'}`
    operations.current[key] ??= crypto.randomUUID()
    try {
      await request(`/v1/warehouse/businesses/${business.id}/wholesale/catalogue${editing ? `/${editing.id}` : ''}`,
        'member', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({
          operationId: operations.current[key], productId, sku, name, grade, packageUnit, baseUnit,
          unitsPerPackage: Number(unitsPerPackage), priceUgxPerPackage: Number(price),
          minimumPackages: Number(minimum), availablePackages: Number(available),
          status: catalogueStatus, ...(editing ? { expectedVersion: editing.version } : {}),
        }) })
      delete operations.current[key]
      setNotice(editing ? 'Catalogue offer updated.' : 'Catalogue offer published.')
      setEditing(null); setSku(''); setName(''); setPrice(''); setAvailable('')
      setItems(await catalogue(business.id))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save offer.') }
    finally { setBusy(false) }
  }
  async function verifyPayment(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    const key = `payment:${invoiceId}:${reference}`
    operations.current[key] ??= crypto.randomUUID()
    try {
      await request(`/v1/finance/wholesale/invoices/${invoiceId}/payments`, 'finance', {
        method: 'POST', body: JSON.stringify({ operationId: operations.current[key],
          provider, providerAccount: account, externalReference: reference,
          amountUgx: Number(amount), paidAt: new Date().toISOString() }),
      })
      delete operations.current[key]
      setNotice('External payment verified and allocated.')
      setReference(''); setAmount('')
      setInvoices(await financeInvoices())
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not verify payment.') }
    finally { setBusy(false) }
  }
  async function download(id: string) {
    try { window.location.assign(await pdfUrl(id, mode)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'PDF unavailable.') }
  }

  if (process.env.NEXT_PUBLIC_WHOLESALE_ENABLED !== 'true') return <div className="rounded-xl border bg-white p-5 text-sm">Live wholesale opens after the database rollout.</div>
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div>
      <p className="text-xs uppercase tracking-wider text-[#77847b]">Live wholesale workflow</p>
      <h2 className="mt-1 text-2xl font-bold">{view}</h2>
      <p className="mt-1 text-sm text-[#77847b]">{view === 'Finance'
        ? 'Verify external payments against confirmed commercial invoices.'
        : 'Orders and offers are shared with approved SME businesses.'}</p>
    </div>{signedIn && <button onClick={() => void logout()} className="text-sm font-semibold text-[#1f7a4d]">Sign out</button>}</div>
    {loading ? <p className="text-sm">Loading…</p> : !signedIn ? <form onSubmit={login}
      className="max-w-md space-y-3 rounded-xl border bg-white p-5">
      <h3 className="font-semibold">{mode === 'finance' ? 'Finance staff sign-in' : 'Warehouse member sign-in'}</h3>
      <input className={inputClass} required type={mode === 'finance' ? 'email' : 'tel'}
        autoComplete="username" placeholder={mode === 'finance' ? 'Email' : '+256 phone number'}
        value={identity} onChange={(event) => setIdentity(event.target.value)} />
      <input className={inputClass} required type="password" autoComplete="current-password"
        placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <button disabled={busy} className={buttonClass}>Sign in</button>
    </form> : <>
      {view === 'Buyer orders' && <div className="space-y-3">{records.length === 0
        ? <p className="rounded-xl border bg-white p-5 text-sm">No SME orders for this warehouse yet.</p>
        : records.map((order) => <article key={order.id} className="rounded-xl border bg-white p-5">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{order.reference}</h3>
            <span className="text-sm font-semibold">{order.status}</span></div>
          <p className="mt-1 text-xs text-[#77847b]">{new Date(order.createdAt).toLocaleString('en-UG', { timeZone: 'Africa/Kampala' })}</p>
          <ul className="mt-3 text-sm">{order.lines.map((line) => <li key={line.id}>
            {line.name} · {line.quantityPackages} {line.packageUnit}(s) × {money(line.unitPriceUgx)}</li>)}</ul>
          <p className="mt-2 font-semibold">{money(order.totalUgx)}</p>
          {order.invoice && <div className="mt-3 text-sm">Invoice {order.invoice.reference} · Paid {money(order.invoice.paidUgx)}
            · Balance {money(order.invoice.balanceUgx)} <button className="ml-2 font-semibold text-[#1f7a4d]"
              onClick={() => void download(order.invoice!.id)}>PDF</button></div>}
          {order.status === 'submitted' && <div className="mt-4 flex flex-wrap items-center gap-2">
            <button disabled={busy} className={buttonClass} onClick={() => void act(order, 'confirm')}>Confirm exact terms</button>
            <input className={`${inputClass} max-w-xs`} placeholder="Reason to decline"
              value={declineReason[order.id] ?? ''} onChange={(event) =>
                setDeclineReason((previous) => ({ ...previous, [order.id]: event.target.value }))} />
            <button disabled={busy || (declineReason[order.id]?.trim().length ?? 0) < 3}
              className="rounded-lg border px-4 py-2 text-sm" onClick={() => void act(order, 'decline')}>Decline</button>
          </div>}
        </article>)}</div>}
      {view === 'Wholesale catalogue' && <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-2">{items.length === 0 ? <p className="rounded-xl border bg-white p-5 text-sm">No offers published.</p>
          : items.map((item) => <button key={item.id} onClick={() => edit(item)}
            className="block w-full rounded-xl border bg-white p-4 text-left text-sm">
            <b>{item.name}</b> · {item.grade} · {item.status}<br />
            {item.available_packages} {item.package_unit}(s) · {money(Number(item.price_ugx_per_package))}
          </button>)}</div>
        <form onSubmit={saveCatalogue} className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2">
          <h3 className="sm:col-span-2 font-semibold">{editing ? `Edit ${editing.sku}` : 'Publish a warehouse offer'}</h3>
          <select required className={inputClass} value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Select crop</option>{crops.map((crop) => <option key={crop.id} value={crop.id}>{crop.name}</option>)}
          </select>
          <input required className={inputClass} placeholder="SKU" value={sku} onChange={(event) => setSku(event.target.value)} />
          <input required className={inputClass} placeholder="Offer name" value={name} onChange={(event) => setName(event.target.value)} />
          <input required className={inputClass} placeholder="Grade" value={grade} onChange={(event) => setGrade(event.target.value)} />
          <input required className={inputClass} placeholder="Package unit (bag)" value={packageUnit} onChange={(event) => setPackageUnit(event.target.value)} />
          <select className={inputClass} value={baseUnit} onChange={(event) => setBaseUnit(event.target.value)}>
            {['kg','nut','pack','bunch'].map((unit) => <option key={unit}>{unit}</option>)}
          </select>
          <label className="text-xs">Units per package<input required type="number" step="0.001" min="0.001" className={inputClass}
            value={unitsPerPackage} onChange={(event) => setUnitsPerPackage(event.target.value)} /></label>
          <label className="text-xs">Price UGX per package<input required type="number" min="1" className={inputClass}
            value={price} onChange={(event) => setPrice(event.target.value)} /></label>
          <label className="text-xs">Minimum packages<input required type="number" min="1" className={inputClass}
            value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
          <label className="text-xs">Available packages<input required type="number" min="0" className={inputClass}
            value={available} onChange={(event) => setAvailable(event.target.value)} /></label>
          <select className={inputClass} value={catalogueStatus} onChange={(event) => setCatalogueStatus(event.target.value)}>
            {['draft','published','archived'].map((status) => <option key={status}>{status}</option>)}
          </select><div className="flex gap-2"><button disabled={busy} className={buttonClass}>Save offer</button>
            {editing && <button type="button" className="rounded-lg border px-3 text-sm" onClick={() => setEditing(null)}>New</button>}</div>
        </form>
      </div>}
      {view === 'Finance' && <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-2">{invoices.length === 0 ? <p className="rounded-xl border bg-white p-5 text-sm">No confirmed wholesale invoices yet.</p>
          : invoices.map((invoice) => <button key={invoice.id} onClick={() => setInvoiceId(invoice.id)}
            className="block w-full rounded-xl border bg-white p-4 text-left text-sm">
            <b>{invoice.reference}</b> · Balance {money(invoice.balanceUgx)}<br />
            Paid {money(invoice.paidUgx)} of {money(invoice.totalUgx)}
          </button>)}</div>
        <form onSubmit={verifyPayment} className="space-y-3 rounded-xl border bg-white p-5">
          <h3 className="font-semibold">Verify external payment</h3>
          <select required className={inputClass} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
            <option value="">Select invoice</option>{invoices.filter((invoice) => invoice.balanceUgx > 0).map((invoice) =>
              <option key={invoice.id} value={invoice.id}>{invoice.reference} · {money(invoice.balanceUgx)} due</option>)}</select>
          <input required className={inputClass} placeholder="Provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
          <input required className={inputClass} placeholder="Provider account" value={account} onChange={(event) => setAccount(event.target.value)} />
          <input required className={inputClass} placeholder="External reference" value={reference} onChange={(event) => setReference(event.target.value)} />
          <input required type="number" min="1" className={inputClass} placeholder="Amount UGX" value={amount}
            onChange={(event) => setAmount(event.target.value)} />
          <button disabled={busy} className={buttonClass}>Verify and allocate</button>
        </form>
      </div>}
    </>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  </div>
}
