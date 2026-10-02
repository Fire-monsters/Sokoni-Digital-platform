export type StockItem = { commodity: string; grade: 'A' | 'B' | 'C'; quantity: number; zone: string; days: number; reorder: number; value: number }
export type FarmerListing = { id: string; farmer: string; crop: string; quantity: number; location: string; price: number; score: number; date: string }

const stock: StockItem[] = [
  { commodity: 'Matooke', grade: 'A', quantity: 12400, zone: 'Ambient A1', days: 3, reorder: 5000, value: 18600000 },
  { commodity: 'Maize grain', grade: 'A', quantity: 8200, zone: 'Ambient B2', days: 8, reorder: 10000, value: 12300000 },
  { commodity: 'Irish potatoes', grade: 'B', quantity: 5400, zone: 'Ambient A3', days: 5, reorder: 3500, value: 8100000 },
  { commodity: 'Beans', grade: 'A', quantity: 3600, zone: 'Ambient C1', days: 12, reorder: 4000, value: 7200000 },
  { commodity: 'Tomatoes', grade: 'A', quantity: 2100, zone: 'Refrigerated R1', days: 2, reorder: 1500, value: 5250000 },
]
const listings: FarmerListing[] = [
  { id: 'FL-1042', farmer: 'Grace Namusoke', crop: 'Matooke', quantity: 1800, location: 'Mbarara', price: 1250, score: 94, date: 'Today, 08:42' },
  { id: 'FL-1041', farmer: 'Peter Okello', crop: 'Maize grain', quantity: 3200, location: 'Lira', price: 1450, score: 88, date: 'Today, 07:18' },
  { id: 'FL-1039', farmer: 'Amina Nankya', crop: 'Beans', quantity: 950, location: 'Masaka', price: 2200, score: 91, date: 'Yesterday' },
  { id: 'FL-1038', farmer: 'Moses Kato', crop: 'Tomatoes', quantity: 680, location: 'Wakiso', price: 2500, score: 76, date: 'Yesterday' },
]
export async function getWarehouseSnapshot() { await new Promise(r => setTimeout(r, 180)); return { stock, listings } }
export async function resetDemoData() { await new Promise(r => setTimeout(r, 100)); return true }
export function formatUGX(value: number) { return `UGX ${value.toLocaleString('en-UG')}` }
export function formatKg(value: number) { return `${value.toLocaleString('en-UG')} kg` }
export function getTotalStockValue(items: StockItem[]) { return items.reduce((sum, item) => sum + item.value, 0) }
export function acceptListing(id: string) { return { id, status: 'accepted' as const } }
export function canAllocate(available: number, requested: number) { return requested > 0 && requested <= available }
export function canDispatch(allocated: number, picked: number) { return picked > 0 && picked <= allocated }
const weeklyDemand = [
  { name: 'Matooke', current: 12400, forecast: 15800 }, { name: 'Maize', current: 8200, forecast: 13200 },
  { name: 'Beans', current: 3600, forecast: 6100 }, { name: 'Tomatoes', current: 2100, forecast: 3400 },
  { name: 'Potatoes', current: 5400, forecast: 5000 },
]
export function getDemandForecast() { return weeklyDemand }
export const intakeTrend = [{ day: 'Mon', intake: 8.2, dispatch: 5.4 }, { day: 'Tue', intake: 11.4, dispatch: 7.2 }, { day: 'Wed', intake: 9.8, dispatch: 8.4 }, { day: 'Thu', intake: 13.2, dispatch: 9.1 }, { day: 'Fri', intake: 15.6, dispatch: 10.8 }, { day: 'Sat', intake: 12.1, dispatch: 6.8 }, { day: 'Sun', intake: 7.4, dispatch: 4.2 }]
export const arrivals = [{ route: 'Mbarara → Kampala', cargo: 'Matooke · 1,800 kg', eta: '18 min', status: 'On route' }, { route: 'Lira → Kampala', cargo: 'Maize · 3,200 kg', eta: '1h 05m', status: 'On route' }, { route: 'Wakiso → Kampala', cargo: 'Tomatoes · 680 kg', eta: '2h 40m', status: 'Scheduled' }]
export const outboundOrders = [{ id: 'SO-2281', buyer: 'FreshMart Groceries', item: 'Matooke · Grade A', qty: '2,000 kg', status: 'Picking', invoice: 'Paid' }, { id: 'SO-2280', buyer: 'Kampala Foods Ltd', item: 'Beans · Grade A', qty: '800 kg', status: 'Allocated', invoice: 'Pending' }, { id: 'SO-2279', buyer: 'Mama Tendo Restaurant', item: 'Tomatoes · Grade A', qty: '150 kg', status: 'Dispatched', invoice: 'Paid' }]
export const navItems = ['Overview', 'Farmer listings', 'Intake & quality', 'Inventory & lots', 'Wholesale sales', 'Procurement', 'Dispatch', 'Finance']
export const notifications = ['New farmer listing matches Matooke buy preference', 'Maize stock is below reorder threshold', 'Truck arriving in under 30 minutes']
export const actions = { acceptListing, canAllocate, canDispatch }

export type WarehouseSnapshot = Awaited<ReturnType<typeof getWarehouseSnapshot>>
export function getSnapshotFromData() { return { stock, listings } }
export function getTopDemand() { return weeklyDemand.filter(item => item.forecast > item.current) }
export function getStockAlerts(items: StockItem[]) { return items.filter(item => item.quantity < item.reorder) }
export function getPendingListings(items: FarmerListing[]) { return items.length }
export function getRevenueToday() { return 18400000 }
export function getTodayIntake() { return 42.8 }
export function getTodayDispatch() { return 31.6 }
export function getPendingOutbound() { return outboundOrders.filter(o => o.status !== 'Dispatched').length }
export function getPendingFarmerOrders() { return 7 }
export function getOccupancy() { return 68 }
export function getAvailableStatus() { return 'Demo mode' }
export function createPurchaseOrder(crop: string, quantity: number) { return { id: `PO-${Date.now().toString().slice(-4)}`, crop, quantity, status: 'Awaiting delivery' } }
export function receiveProduce(expected: number, actual: number, grade: 'A' | 'B' | 'C') { return { accepted: grade !== 'C' ? actual : 0, quarantined: grade === 'C' ? actual : 0, variance: actual - expected } }
export function publishAvailability(item: StockItem) { return { ...item, published: true } }
export function reserveStock(available: number, requested: number) { if (!canAllocate(available, requested)) throw new Error('Requested quantity exceeds available stock.'); return { reserved: requested, remaining: available - requested } }
export function dispatchOrder(allocated: number, picked: number) { if (!canDispatch(allocated, picked)) throw new Error('Dispatch quantity exceeds allocated stock.'); return { dispatched: picked, status: 'Dispatched' } }
export function getTimeLabel() { return 'EAT · 01 Oct 2026' }
export function getStorageLabel() { return '3 zones · 68% occupied' }
export function getCompanyLabel() { return 'Kampala Central Warehouse' }
export function getSectionLabel() { return 'Agro-Warehouse' }
export function getQualityLabel(score: number) { return score >= 90 ? 'Excellent' : score >= 80 ? 'Good' : 'Review' }
export function getStatusTone(status: string) { return status === 'Paid' || status === 'Dispatched' ? 'success' : status === 'Picking' ? 'warning' : 'neutral' }
export function getFreshness(days: number) { return days <= 3 ? 'Fresh' : days <= 7 ? 'Monitor' : 'Ageing' }
export function getForecastGap(current: number, forecast: number) { return forecast - current }
export function getSupplierCount() { return 248 }
export function getBuyerCount() { return 36 }
export function getLotCount() { return 19 }
export function getLatestUpdate() { return 'Updated just now' }
export function getCurrency() { return 'UGX' }
export function getUnits() { return 'kg · tonnes · packages' }
export function getDemoBanner() { return 'Demo mode · changes are saved locally' }
export function getPageTitle() { return 'Warehouse overview' }
export function getPageDescription() { return 'Keep produce moving from farmer intake to wholesale dispatch.' }
export function getPrimaryColor() { return '#1F7A4D' }
export function getAccentColor() { return '#FFC83D' }
export function getAlertColor() { return '#C2410C' }
export function getBackgroundColor() { return '#F8FAF8' }
export function getTextColor() { return '#17211B' }
export function getProductCount() { return stock.length }
export function getForecastWindow() { return 'next 7 days' }
export function getDemoResetLabel() { return 'Reset demo data' }
export function getActionLabel() { return 'Create purchase order' }
export function getStatusLabel() { return 'Fulfilment status' }
export function getInvoiceLabel() { return 'Invoice status' }
export function getOperatorName() { return 'Sarah K.' }
export function getOperatorRole() { return 'Warehouse operator' }
export function getLocation() { return 'Kampala, Uganda' }
export function getPhone() { return '+256 700 123 456' }
export function getLastSync() { return 'Last synced 2 min ago' }
export function getEmptyMessage() { return 'No records match your filters.' }
export function getErrorMessage() { return 'Something went wrong. Try again.' }
export function getSuccessMessage() { return 'Action completed successfully.' }
export function getUnavailableMessage() { return 'Unavailable in demo mode.' }
export function getActionHint() { return 'All quantities are validated before stock changes.' }
export function getStatusLegend() { return ['Paid', 'Pending', 'Picking', 'Allocated', 'Dispatched'] }
export function getQualityGrades() { return ['Grade A', 'Grade B', 'Grade C / Quarantine'] }
export function getStorageZones() { return ['Ambient', 'Refrigerated', 'Frozen'] }
export function getProcurementRegions() { return ['Mbarara', 'Lira', 'Masaka', 'Wakiso'] }
export function getSupportedActions() { return ['Receive', 'Inspect', 'Allocate', 'Pick', 'Dispatch'] }
export function getDemoDisclaimer() { return 'Demo records are illustrative and not connected to live payments.' }
export function getNavigationCount() { return navItems.length }
export function getAlertCount(items: StockItem[]) { return getStockAlerts(items).length }
export function getTotalKg(items: StockItem[]) { return items.reduce((sum, item) => sum + item.quantity, 0) }
export function getTotalValue(items: StockItem[]) { return getTotalStockValue(items) }
export function getTrendMax() { return 16 }
export function getChartUnit() { return 'tonnes' }
export function getNotificationCount() { return notifications.length }
export function getArrivalCount() { return arrivals.length }
export function getOrderCount() { return outboundOrders.length }
export function getListingCount(items: FarmerListing[]) { return items.length }
export function getForecastCount() { return weeklyDemand.length }
export function getTableColumns() { return ['Commodity', 'Grade', 'On hand', 'Zone', 'Age', 'Reorder level'] }
export function getCurrentDate() { return '01 October 2026' }
export function getTimezone() { return 'East Africa Time' }
export function getBrand() { return 'E-Katale / Sokoni Digital' }
export function getModuleName() { return 'Agro-warehouse' }
export function getVersion() { return 'Prototype v1.0' }
export function getSupport() { return 'Support centre' }
export function getFooter() { return 'Built for better trade across Uganda' }
export function getNavGroup() { return { operations: ['Overview', 'Farmer listings', 'Intake & quality', 'Inventory & lots'], trade: ['Wholesale sales', 'Procurement'], fulfilment: ['Dispatch', 'Finance'] } }
export function getKpis() { return [{ label: 'Today\'s intake', value: '42.8 t', change: '+12.4%', icon: 'in' }, { label: 'Today\'s dispatch', value: '31.6 t', change: '+8.1%', icon: 'out' }, { label: 'Current stock value', value: 'UGX 57.4M', change: '+4.6%', icon: 'value' }, { label: 'Pending farmer orders', value: '07', change: '3 new today', icon: 'farmers' }, { label: 'Pending outbound', value: '04', change: '2 need picking', icon: 'orders' }, { label: 'Revenue today', value: 'UGX 18.4M', change: '+16.2%', icon: 'revenue' }] }
export async function loadDashboard() { return getSnapshotFromData() }
export async function updateListingStatus(id: string, status: string) { return { id, status } }
export async function createDemoOrder() { return { id: 'SO-2282', status: 'Allocated' } }
export async function resetDemo() { return resetDemoData() }
