/**
 * Centralized route definitions for the Shipping module.
 */

export const SHIPPING_ROUTES = {
  list: '/envio',
} as const;

export const SHIPPING_API_ROUTES = {
  createShipment: '/api/tristar/create-shipment',
  confirmShipment: '/api/tristar/confirm-shipment',
  trackShipment: '/api/tristar/track',
  getLabel: '/api/tristar/label',
  inventory: '/api/tristar/inventory',
  attachDocuments: '/api/tristar/attach-documents',
} as const;
