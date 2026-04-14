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
  shipment_item_type: TriStarItemTypeValue;
  description: string;
  quantity: number;
  unit_price: number;
  /** Required when shipment_item_type === 40 (CBD) */
  anvisa_import_authorization_number?: string;
  /** Required when shipment_item_type === 40 (CBD) */
  anvisa_product_commercial_name?: string;
}

/**
 * Payload sent by the TriStar dialog to our /api/tristar/create-shipment route.
 * Does NOT include from_* sender fields — those are injected server-side from env vars.
 */
export interface TriStarDialogPayload {
  to_name: string;
  to_document: string;
  to_address: string;
  to_number: string;
  to_complement?: string;
  to_neighborhood: string;
  to_city: string;
  to_state: string;
  to_country: string;
  to_postcode: string;
  to_phone?: string;
  to_email?: string;
  items: TriStarShipmentItem[];
  with_insurance: boolean;
  insurance_value?: number;
}

/**
 * Full payload sent to the TriStar API.
 * Extends TriStarDialogPayload with sender (from_*) fields and integration_code,
 * which are injected server-side from environment variables.
 */
export interface TriStarCreateShipmentRequest extends TriStarDialogPayload {
  from_name: string;
  from_document: string;
  from_address: string;
  from_number: string;
  from_complement?: string;
  from_neighborhood: string;
  from_city: string;
  from_state: string;
  from_country: string;
  from_postcode: string;
  from_phone: string;
  from_email: string;
  integration_code: number;
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
