/**
 * Shipping Service — mock implementation.
 *
 * Generates a fake tracking number and marks the order as shipped.
 *
 * REPLACE LATER: integrate a real shipping carrier API:
 *   - Correios: POST /v1/prepostagem → returns tracking code (e.g. "AA123456789BR")
 *   - Melhor Envio: POST /api/v2/me/shipment/generate → returns tracking
 *   - EasyPost: await shipment.buy(shipment.lowestRate()) → returns tracking_code
 *
 *   After obtaining the real tracking number:
 *     await updateDoc(orderRef, {
 *       orderStatus: "shipped",
 *       trackingNumber: realTrackingCode,
 *     })
 */

import { mockDB } from "../mockDB";
import { generateTrackingNumber } from "../mockShipping";
import { MockOrder } from "../types/order";

export function shipOrder(orderId: string): MockOrder {
  const order = mockDB.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`[ShippingService] Order not found: ${orderId}`);
  if (order.orderStatus !== "paid")
    throw new Error(
      `[ShippingService] Cannot ship order in status: ${order.orderStatus}`
    );

  const tracking = generateTrackingNumber();
  order.trackingNumber = tracking;
  order.orderStatus = "shipped";

  console.log(
    `[ShippingService] Order shipped: ${orderId} — tracking: ${tracking}`
  );
  return order;
}
