export type CropType = "cash" | "food";
export type PackageUnit = "bag" | "carton" | "sack" | "bunch" | "crate";
export type StockUnit = "kg" | "pack" | "nut" | "bunch";
export const STORAGE_LOCATIONS = ["Dry goods store", "Fresh produce area", "Shop floor"] as const;
export type StorageLocation = (typeof STORAGE_LOCATIONS)[number];

export interface WholesaleProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  cropType: CropType;
  grade: string;
  packaging: string;
  packageUnit: PackageUnit;
  stockUnit: StockUnit;
  unitsPerPackage: number;
  pricePerPackage: number;
  moq: number;
  availablePackages: number;
  supplier: string;
  etaDays: number;
  /** Illustrative consumer market price per stock unit */
  marketPricePerUnit: number;
}

export interface CartLine {
  productId: string;
  quantity: number; // packages
}

export type PaymentMethod = "mobile_money" | "bank_transfer" | "trade_credit";
export type POStatus = "submitted" | "confirmed" | "in_transit" | "received" | "cancelled";

export interface POLine {
  productId: string;
  name: string;
  packageUnit: PackageUnit;
  stockUnit: StockUnit;
  unitsPerPackage: number;
  quantity: number;
  unitPrice: number;
}

export interface PurchaseOrder {
  id: string;
  createdAt: string;
  status: POStatus;
  lines: POLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: "paid" | "pending" | "refunded";
  eta: string;
  receivedAt?: string;
  notes?: string;
  history: { status: POStatus; at: string }[];
}

export interface InventoryItem {
  id: string;
  productId: string;
  name: string;
  location: StorageLocation;
  category: string;
  cropType: CropType;
  stockUnit: StockUnit;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  avgUnitCost: number;
}

export type MovementType = "received" | "adjustment" | "sale" | "reserved" | "released";

export interface StockMovement {
  id: string;
  itemId: string;
  at: string;
  type: MovementType;
  quantity: number;
  reason: string;
  ref?: string;
}

export type ListingStatus = "draft" | "pending_review" | "live" | "paused";

export interface Listing {
  id: string;
  inventoryItemId: string;
  title: string;
  description: string;
  retailPrice: number;
  status: ListingStatus;
  imageDataUrl?: string;
  discountPct: number;
  dailySpecial: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SOStatus =
  "new" | "accepted" | "preparing" | "ready_for_pickup" | "completed" | "rejected";

export interface SOLine {
  listingId: string;
  inventoryItemId: string;
  title: string;
  stockUnit: StockUnit;
  quantity: number;
  unitPrice: number;
}

export interface SalesOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  pickupNote: string;
  createdAt: string;
  status: SOStatus;
  lines: SOLine[];
  total: number;
  checklist: { qualityChecked: boolean; weighed: boolean; packed: boolean };
  rejectReason?: string;
  history: { status: SOStatus; at: string }[];
}

export interface BusinessProfile {
  name: string;
  owner: string;
  location: string;
  district: string;
  phone: string;
  email: string;
  description: string;
  hours: string;
  cropTypes: CropType[];
  categories: string[];
  notifications: { lowStock: boolean; newOrders: boolean; deliveries: boolean };
}

export interface DemoDB {
  version: 1;
  profile: BusinessProfile;
  products: WholesaleProduct[];
  cart: CartLine[];
  purchaseOrders: PurchaseOrder[];
  inventory: InventoryItem[];
  movements: StockMovement[];
  listings: Listing[];
  salesOrders: SalesOrder[];
}

export const CATEGORIES: Record<CropType, string[]> = {
  cash: ["coffee", "maize", "cocoa", "coconut"],
  food: ["beans", "bananas", "rice", "groundnuts", "vegetables"],
};
