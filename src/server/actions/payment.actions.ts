'use server';

import { createGlobalPayLink } from '@/server/integrations/globalpay';

export async function generatePaymentLink(
  orderId: string,
  amount: number,
  currency: string = 'BRL',
): Promise<{ paymentUrl: string; gpId: string; status: string }> {
  const result = await createGlobalPayLink({
    amount: Math.round(amount * 100),
    currency,
    merchantCode: process.env.GLOBALPAYS_MERCHANT_CODE || '4912',
    referenceId: orderId,
    expiresInHours: parseInt(process.env.PAYMENT_LINK_EXPIRATION_HOURS || '24', 10),
  });

  return {
    paymentUrl: result.paymentUrl,
    gpId: result.gpId,
    status: result.status,
  };
}
