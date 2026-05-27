/**
 * Centralized route definitions for the Shipping module.
 *
 * The carrier-specific API routes (previously TriStar) were removed when
 * we migrated providers. A new map will be added here when the Memphis
 * integration lands.
 */

export const SHIPPING_ROUTES = {
  list: '/envio',
} as const;
