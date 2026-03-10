import type { OrderShipping } from './order';

// ---------------------------------------------------------------------------
// Shipping method identifiers
// ---------------------------------------------------------------------------

export type ShippingMethod = 'TRISTAR' | 'LOCAL_MAIL' | 'MOTOBOY' | 'OTHER';

export type ManualShippingStatus = 'pending' | 'sent' | 'received' | 'lost' | 'suspended' | 'returned';

// ---------------------------------------------------------------------------
// TriStar item types (from API documentation)
// ---------------------------------------------------------------------------

export const TRISTAR_ITEM_TYPES = [
  { value: 10, label: 'Produtos' },
  { value: 20, label: 'Livros' },
  { value: 30, label: 'Medicamento' },
  { value: 40, label: 'CBD' },
  { value: 41, label: 'THC' },
  { value: 90, label: 'Outro (imune)' },
] as const;

export type TriStarItemTypeValue = (typeof TRISTAR_ITEM_TYPES)[number]['value'];

// ---------------------------------------------------------------------------
// TriStar API request / response shapes
// ---------------------------------------------------------------------------

export interface TriStarShipmentItem {
  type: TriStarItemTypeValue;
  quantity: number;
  value: number;
  /** Required when type === 40 (CBD) */
  anvisa_import_authorization_number?: string;
  /** Required when type === 40 (CBD) */
  anvisa_product_commercial_name?: string;
}

export interface TriStarRecipientAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
}

export interface TriStarRecipient {
  name: string;
  document: string;
  address: TriStarRecipientAddress;
}

export interface TriStarCreateShipmentRequest {
  recipient: TriStarRecipient;
  items: TriStarShipmentItem[];
  insurance: boolean;
  insurance_value: number;
}

export interface TriStarShipmentResponse {
  id: string;
  status: number;
  tracking_code?: string;
  label_url?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Extended shipping record (stored in Firestore, extends OrderShipping)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TriStar Stock / Inventory types (from API docs: stocks-index, stocks-show)
// ---------------------------------------------------------------------------

export interface TriStarStockItem {
  id: number;
  product_name: string;
  sku: string;
  quantity: number;
  reserved: number;
  available: number;
  warehouse?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TriStarStockListResponse {
  data: TriStarStockItem[];
  /** Pagination metadata — may vary by API version */
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Extended shipping record (stored in Firestore, extends OrderShipping)
// ---------------------------------------------------------------------------

export type ShippingRecord = OrderShipping & {
  /** Which shipping method was used */
  method?: ShippingMethod;

  // TriStar-specific fields
  tristarShipmentId?: string;
  tristarStatus?: number;
  tristarTrackingCode?: string;
  tristarLabelUrl?: string;

  // Local mail (Correios) specific fields
  carrier?: string;          // e.g. "Sedex", "PAC"
  trackingNumber?: string;   // manually entered tracking number
  shipper?: string;          // sender's name

  // Common manual fields
  sendDate?: string;         // ISO date string
  cost?: number;             // actual shipping cost
  notes?: string;            // status notes or courier instructions
  shippingStatus?: ManualShippingStatus;
};
