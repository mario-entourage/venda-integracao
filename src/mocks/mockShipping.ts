/**
 * Mock shipping utilities.
 *
 * Generates a fake tracking number in the format TRK-XXXXXXXX.
 *
 * REPLACE LATER: integrate with a real shipping provider:
 *   - Correios: POST to /v1/prepostagem to generate a label + tracking code
 *   - Melhor Envio: POST /api/v2/me/shipment/generate
 *   - ShipStation, EasyPost, etc.
 * The real API will return an actual carrier tracking number.
 */

export function generateTrackingNumber(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const random = Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
  return `TRK-${random}`;
}
