import type { OrderShipping } from './order';

// ---------------------------------------------------------------------------
// Shipping method identifiers
// ---------------------------------------------------------------------------

export type ShippingMethod = 'LOCAL_MAIL' | 'MOTOBOY' | 'OTHER';

export type ManualShippingStatus =
  | 'pending'
  | 'sent'
  | 'received'
  | 'lost'
  | 'suspended'
  | 'returned';

// ---------------------------------------------------------------------------
// Extended shipping record (stored in Firestore, extends OrderShipping)
// ---------------------------------------------------------------------------

export type ShippingRecord = OrderShipping & {
  /** Which shipping method was used */
  method?: ShippingMethod;

  // Local mail (Correios) specific fields
  carrier?: string; // e.g. "Sedex", "PAC"
  trackingNumber?: string; // manually entered tracking number
  shipper?: string; // sender's name

  // Common manual fields
  sendDate?: string; // ISO date string
  cost?: number; // actual shipping cost
  notes?: string; // status notes or courier instructions
  shippingStatus?: ManualShippingStatus;
};
