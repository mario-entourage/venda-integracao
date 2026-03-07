/**
 * QA Tests — ZapSign E-Signature Integration
 *
 * These tests verify:
 *   1. Procuracao markdown generation (correct formatting, CPF, CEP, address)
 *   2. Comprovante de Vinculo markdown generation (two-person format)
 *   3. Document creation API call (happy path)
 *   4. Error handling (missing API key, API errors, missing response fields)
 *   5. Sandbox mode configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let buildProcuracaoMarkdown: typeof import('./zapsign').buildProcuracaoMarkdown;
let buildComprovanteVinculoMarkdown: typeof import('./zapsign').buildComprovanteVinculoMarkdown;
let createZapSignDocument: typeof import('./zapsign').createZapSignDocument;
let ZapSignError: typeof import('./zapsign').ZapSignError;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();

  process.env.ZAPSIGN_API_URL = 'https://sandbox.api.zapsign.com.br';
  process.env.ZAPSIGN_API_KEY = 'test-zapsign-key';
  process.env.ZAPSIGN_SANDBOX = 'false';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.entouragelab.com';

  const mod = await import('./zapsign');
  buildProcuracaoMarkdown = mod.buildProcuracaoMarkdown;
  buildComprovanteVinculoMarkdown = mod.buildComprovanteVinculoMarkdown;
  createZapSignDocument = mod.createZapSignDocument;
  ZapSignError = mod.ZapSignError;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ZAPSIGN_API_URL;
  delete process.env.ZAPSIGN_API_KEY;
  delete process.env.ZAPSIGN_SANDBOX;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

// ─── Test Data ──────────────────────────────────────────────────────────────

const validParams = {
  orderId: 'order-123',
  signerName: 'Maria Silva',
  signerCpf: '12345678901',
  signerEmail: 'maria@example.com',
  signerPhone: '11999887766',
  signerAddress: {
    street: 'Rua das Flores',
    number: '123',
    complement: 'Apto 4B',
    neighborhood: 'Jardins',
    city: 'Sao Paulo',
    state: 'SP',
    postalCode: '01234567',
  },
};

const validParamsWithClient = {
  ...validParams,
  clientInfo: {
    name: 'Joao Santos',
    cpf: '98765432100',
  },
};

// ─── Markdown Builder Tests ─────────────────────────────────────────────────

describe('buildProcuracaoMarkdown', () => {
  it('formats CPF as ###.###.###-##', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('123.456.789-01');
  });

  it('formats CEP as #####-###', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('01234-567');
  });

  it('includes the signer name in the document', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('Maria Silva');
  });

  it('includes the full address', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('Rua das Flores, 123');
    expect(md).toContain('Jardins');
    expect(md).toContain('Sao Paulo/SP');
  });

  it('includes the Procuracao title', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('# PROCURAÇÃO');
  });

  it('includes Caio Santos Abreu as the named attorney', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('Caio Santos Abreu');
    expect(md).toContain('025.289.547-94');
  });

  it('mentions ANVISA and RDC in the legal text', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('ANVISA');
    expect(md).toContain('RDC');
  });

  it('includes the logo URL from NEXT_PUBLIC_APP_URL', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('https://app.entouragelab.com/logo.png');
  });

  it('includes city in the date line', () => {
    const md = buildProcuracaoMarkdown(validParams);
    expect(md).toContain('**Sao Paulo**');
  });

  it('pads short CPFs with leading zeros', () => {
    const params = { ...validParams, signerCpf: '123' };
    const md = buildProcuracaoMarkdown(params);
    // Should pad to 11 digits: 00000000123 -> 000.000.001-23
    expect(md).toContain('000.000.001-23');
  });
});

describe('buildComprovanteVinculoMarkdown', () => {
  it('includes the Comprovante de Vinculo title', () => {
    const md = buildComprovanteVinculoMarkdown(validParamsWithClient);
    expect(md).toContain('# COMPROVANTE DE VÍNCULO');
  });

  it('includes BOTH signer and client names when clientInfo is provided', () => {
    const md = buildComprovanteVinculoMarkdown(validParamsWithClient);
    expect(md).toContain('Maria Silva');
    expect(md).toContain('Joao Santos');
  });

  it('formats both CPFs correctly', () => {
    const md = buildComprovanteVinculoMarkdown(validParamsWithClient);
    expect(md).toContain('123.456.789-01'); // signer
    expect(md).toContain('987.654.321-00'); // client
  });

  it('includes the address with CEP', () => {
    const md = buildComprovanteVinculoMarkdown(validParamsWithClient);
    expect(md).toContain('Rua das Flores');
    expect(md).toContain('Apto 4B');
    expect(md).toContain('CEP 01234-567');
  });

  it('falls back to signer info when clientInfo is not provided', () => {
    const md = buildComprovanteVinculoMarkdown(validParams);
    // Both names should be the signer name
    const matches = md.match(/Maria Silva/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── API Call Tests ─────────────────────────────────────────────────────────

describe('createZapSignDocument', () => {
  function makeZapSignResponse(
    token = 'doc-token-abc',
    signUrl = 'https://app.zapsign.com.br/sign/abc',
  ) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token,
        status: 'pending',
        signers: [
          {
            token: 'signer-token-xyz',
            sign_url: signUrl,
          },
        ],
      }),
    };
  }

  describe('happy path', () => {
    it('creates a procuracao document and returns the result', async () => {
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      const result = await createZapSignDocument(validParams, 'procuracao');

      expect(result.docId).toBe('doc-token-abc');
      expect(result.signUrl).toBe('https://app.zapsign.com.br/sign/abc');
      expect(result.signerToken).toBe('signer-token-xyz');
      expect(result.status).toBe('pending');
    });

    it('creates a comprovante_vinculo document', async () => {
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      const result = await createZapSignDocument(validParamsWithClient, 'comprovante_vinculo');

      expect(result.docId).toBe('doc-token-abc');

      // Verify the request body
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.name).toContain('Comprovante de Vínculo');
      expect(body.external_id).toBe('order-123');
    });

    it('sends correct API request', async () => {
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      await createZapSignDocument(validParams);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://sandbox.api.zapsign.com.br/api/v1/docs/');
      expect(opts.method).toBe('POST');
      expect(opts.headers.Authorization).toBe('Bearer test-zapsign-key');
      expect(opts.headers['Content-Type']).toBe('application/json');
    });

    it('sets sandbox mode from env var', async () => {
      process.env.ZAPSIGN_SANDBOX = 'true';
      vi.resetModules();
      const mod = await import('./zapsign');
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      await mod.createZapSignDocument(validParams);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.sandbox).toBe(true);
    });

    it('includes signer details with auth_mode "assinaturaTela"', async () => {
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      await createZapSignDocument(validParams);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.signers).toHaveLength(1);
      expect(body.signers[0].name).toBe('Maria Silva');
      expect(body.signers[0].auth_mode).toBe('assinaturaTela');
      expect(body.signers[0].send_automatic_email).toBe(false);
      expect(body.signers[0].send_automatic_whatsapp).toBe(false);
    });

    it('sets external_id to the orderId for webhook correlation', async () => {
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      await createZapSignDocument(validParams);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.external_id).toBe('order-123');
    });

    it('sets language to pt-br', async () => {
      mockFetch.mockResolvedValueOnce(makeZapSignResponse());

      await createZapSignDocument(validParams);

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.lang).toBe('pt-br');
    });
  });

  describe('error handling', () => {
    it('throws ZapSignError when API key is missing', async () => {
      delete process.env.ZAPSIGN_API_KEY;
      vi.resetModules();
      const mod = await import('./zapsign');

      await expect(
        mod.createZapSignDocument(validParams),
      ).rejects.toThrow(/ZAPSIGN_API_KEY/);
    });

    it('throws ZapSignError when API returns non-OK status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(createZapSignDocument(validParams)).rejects.toThrow(
        /ZapSign API returned 403/,
      );
    });

    it('throws when response has no document token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'pending', signers: [] }),
      });

      await expect(createZapSignDocument(validParams)).rejects.toThrow(
        /document token/,
      );
    });

    it('throws when response has no signer sign_url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: 'doc-token',
          status: 'pending',
          signers: [{ token: 'signer-token' }], // No sign_url
        }),
      });

      await expect(createZapSignDocument(validParams)).rejects.toThrow(
        /sign_url/,
      );
    });
  });
});
