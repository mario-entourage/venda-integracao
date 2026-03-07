/**
 * QA Tests — GlobalPay Payment Integration
 *
 * These tests verify:
 *   1. Payment link creation (happy path)
 *   2. Token authentication flow
 *   3. Token caching and refresh
 *   4. Auto-retry on 401 auth errors
 *   5. Error handling (missing config, API errors, parse errors)
 *   6. Error message mapping for known error codes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Reset module cache between tests to clear token cache
let createGlobalPayLink: typeof import('./globalpay').createGlobalPayLink;
let getGlobalPayTransaction: typeof import('./globalpay').getGlobalPayTransaction;
let cancelGlobalPayTransaction: typeof import('./globalpay').cancelGlobalPayTransaction;
let GlobalPayError: typeof import('./globalpay').GlobalPayError;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();

  // Set required env vars
  process.env.GLOBALPAY_API_URL = 'https://api.test.globalpays.com/v1';
  process.env.GLOBALPAY_PUB_KEY = 'test-pub-key-123';
  process.env.GLOBALPAYS_MERCHANT_CODE = '4912';

  const mod = await import('./globalpay');
  createGlobalPayLink = mod.createGlobalPayLink;
  getGlobalPayTransaction = mod.getGlobalPayTransaction;
  cancelGlobalPayTransaction = mod.cancelGlobalPayTransaction;
  GlobalPayError = mod.GlobalPayError;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GLOBALPAY_API_URL;
  delete process.env.GLOBALPAY_PUB_KEY;
  delete process.env.GLOBALPAYS_MERCHANT_CODE;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAuthResponse(token = 'jwt-token-abc') {
  return {
    ok: true,
    json: async () => ({
      statusCode: 1,
      statusType: 'success',
      token,
      expirate: '2026-12-31 23:59:59',
    }),
  };
}

function makeOrderResponse(orderId = 'gp-order-001', url = 'https://pay.globalpays.com/checkout/123') {
  return {
    ok: true,
    json: async () => ({
      statusCode: 1,
      data: {
        orderId,
        url,
        authCode: 'AUTH001',
      },
    }),
  };
}

function makeErrorOrderResponse(statusCode: number, statusType = 'error', msg?: string) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      statusCode,
      statusType,
      msg,
    }),
  };
}

const validRequest = {
  amount: 199.99,
  currency: 'USD',
  merchantCode: '4912',
  referenceId: 'order-123',
  callbackUrl: 'https://app.entouragelab.com/controle/order-123',
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createGlobalPayLink', () => {
  describe('happy path', () => {
    it('authenticates then creates a payment link', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce(makeOrderResponse());

      const result = await createGlobalPayLink(validRequest);

      expect(result.paymentUrl).toBe('https://pay.globalpays.com/checkout/123');
      expect(result.gpOrderId).toBe('gp-order-001');
      expect(result.referenceId).toBe('order-123');
      expect(result.status).toBe('created');
    });

    it('sends correct auth payload', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce(makeOrderResponse());

      await createGlobalPayLink(validRequest);

      // First call should be auth
      const [authUrl, authOpts] = mockFetch.mock.calls[0];
      expect(authUrl).toContain('/paymentapi/auth');
      const authBody = JSON.parse(authOpts.body);
      expect(authBody.pubKey).toBe('test-pub-key-123');
      expect(authBody.merchantCode).toBe('4912');
    });

    it('sends Bearer token in the order creation request', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse('my-jwt-token'))
        .mockResolvedValueOnce(makeOrderResponse());

      await createGlobalPayLink(validRequest);

      // Second call should be order creation with Bearer token
      const [, orderOpts] = mockFetch.mock.calls[1];
      expect(orderOpts.headers.Authorization).toBe('Bearer my-jwt-token');
    });

    it('includes customer data in the request body', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce(makeOrderResponse());

      await createGlobalPayLink({
        ...validRequest,
        customerDocument: '12345678901',
        customerPhone: '11999887766',
      });

      const [, orderOpts] = mockFetch.mock.calls[1];
      const body = JSON.parse(orderOpts.body);
      expect(body.client.name).toBe('John Doe');
      expect(body.client.email).toBe('john@example.com');
      expect(body.client.doc).toBe('12345678901');
      expect(body.client.phone).toBe('11999887766');
    });

    it('includes payment methods when provided', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce(makeOrderResponse());

      await createGlobalPayLink({
        ...validRequest,
        paymentMethods: ['credit_card', 'pix'],
      });

      const [, orderOpts] = mockFetch.mock.calls[1];
      const body = JSON.parse(orderOpts.body);
      expect(body.paymentMethods).toEqual(['credit_card', 'pix']);
    });
  });

  describe('token caching', () => {
    it('reuses cached token on subsequent calls', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse('cached-token'))
        .mockResolvedValueOnce(makeOrderResponse())
        .mockResolvedValueOnce(makeOrderResponse());

      await createGlobalPayLink(validRequest);
      await createGlobalPayLink(validRequest);

      // Auth should only be called once; order endpoint called twice
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const urls = mockFetch.mock.calls.map((call: unknown[]) => call[0] as string);
      const authCalls = urls.filter((u) => u.includes('/paymentapi/auth'));
      expect(authCalls).toHaveLength(1);
    });
  });

  describe('auto-retry on 401', () => {
    it('retries once with a fresh token when order endpoint returns 401', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse('stale-token')) // initial auth
        .mockResolvedValueOnce(makeErrorOrderResponse(401, 'token_error')) // first order attempt fails
        .mockResolvedValueOnce(makeAuthResponse('fresh-token')) // re-auth
        .mockResolvedValueOnce(makeOrderResponse()); // second order attempt succeeds

      const result = await createGlobalPayLink(validRequest);

      expect(result.paymentUrl).toBe('https://pay.globalpays.com/checkout/123');
      // 4 calls: auth, order (401), re-auth, order (success)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('throws after second 401 (does not retry infinitely)', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse('token-1'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cod: '401', statusCode: 401 }),
        })
        .mockResolvedValueOnce(makeAuthResponse('token-2'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ statusCode: 401 }),
          status: 401,
          statusText: 'Unauthorized',
        });

      await expect(createGlobalPayLink(validRequest)).rejects.toThrow(
        /Token inválido ou expirado|GlobalPay order failed/,
      );
    });
  });

  describe('error handling', () => {
    it('throws GlobalPayError when missing GLOBALPAY_PUB_KEY', async () => {
      delete process.env.GLOBALPAY_PUB_KEY;

      // Re-import to pick up missing env var
      vi.resetModules();
      const mod = await import('./globalpay');

      await expect(
        mod.createGlobalPayLink(validRequest),
      ).rejects.toThrow(/GLOBALPAY_PUB_KEY/);
    });

    it('throws GlobalPayError when auth endpoint fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          statusCode: 320,
          statusType: 'error',
          msg: 'Invalid credentials',
        }),
      });

      await expect(createGlobalPayLink(validRequest)).rejects.toThrow(
        /Token request failed/,
      );
    });

    it('throws when payment URL is missing in response', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            statusCode: 1,
            data: { orderId: '123' }, // No url field
          }),
        });

      await expect(createGlobalPayLink(validRequest)).rejects.toThrow(
        /payment URL/,
      );
    });

    it('maps known error codes to Portuguese messages', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce(makeErrorOrderResponse(340));

      try {
        await createGlobalPayLink(validRequest);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Valor (amount) deve ser maior ou igual a 1');
      }
    });

    it('uses raw message when error code is unknown', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAuthResponse())
        .mockResolvedValueOnce(makeErrorOrderResponse(999, 'unknown_error', 'Something broke'));

      try {
        await createGlobalPayLink(validRequest);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('Something broke');
      }
    });
  });
});

describe('getGlobalPayTransaction', () => {
  it('queries a transaction by gpOrderId', async () => {
    mockFetch
      .mockResolvedValueOnce(makeAuthResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          statusCode: 1,
          data: { orderId: 'gp-123', status: 'approved' },
        }),
      });

    const result = await getGlobalPayTransaction('gp-123');

    expect(result).toEqual({ orderId: 'gp-123', status: 'approved' });
    const [url] = mockFetch.mock.calls[1];
    expect(url).toContain('/paymentapi/order/gp-123');
  });

  it('throws on API error', async () => {
    mockFetch
      .mockResolvedValueOnce(makeAuthResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ statusCode: 400, msg: 'Not found' }),
      });

    await expect(getGlobalPayTransaction('gp-999')).rejects.toThrow(/Query failed/);
  });
});

describe('cancelGlobalPayTransaction', () => {
  it('cancels a transaction by gpOrderId', async () => {
    mockFetch
      .mockResolvedValueOnce(makeAuthResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ statusCode: 1 }),
      });

    await expect(cancelGlobalPayTransaction('gp-123')).resolves.toBeUndefined();

    const [url, opts] = mockFetch.mock.calls[1];
    expect(url).toContain('/paymentapi/order/gp-123/cancel');
    expect(opts.method).toBe('POST');
  });

  it('throws on cancellation failure', async () => {
    mockFetch
      .mockResolvedValueOnce(makeAuthResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ statusCode: 400, msg: 'Already cancelled' }),
      });

    await expect(cancelGlobalPayTransaction('gp-123')).rejects.toThrow(/Cancellation failed/);
  });
});
