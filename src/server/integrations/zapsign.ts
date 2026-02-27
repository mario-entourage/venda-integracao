/**
 * ZapSign API integration — creates procuração documents for electronic signing.
 *
 * Single-step flow:
 *   POST /api/v1/docs/  — create a document from markdown text with a signer.
 *
 * Documentation: https://docs.zapsign.com.br
 *
 * Environment variables:
 *   ZAPSIGN_API_URL  — base URL (defaults to https://api.zapsign.com.br)
 *   ZAPSIGN_API_KEY  — bearer token from Settings > Integrations > ZAPSIGN API
 */

// ─── types ───────────────────────────────────────────────────────────────────

export interface CreateProcuracaoParams {
  orderId: string;
  signerName: string;
  signerCpf: string;
  signerEmail?: string;
  signerPhone?: string;
  signerPhoneCountry?: string;
  signerAddress: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
  };
}

export interface ZapSignDocumentResult {
  /** ZapSign document token (use as the ID). */
  docId: string;
  /** URL the signer visits to review & sign the document. */
  signUrl: string;
  /** Signer-specific token (for status queries). */
  signerToken: string;
  /** Current signature status (e.g. "pending"). */
  status: string;
}

// ─── error ───────────────────────────────────────────────────────────────────

export class ZapSignError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public detail?: string,
  ) {
    super(message);
    this.name = 'ZapSignError';
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  return (process.env.ZAPSIGN_API_URL || 'https://api.zapsign.com.br').replace(
    /\/$/,
    '',
  );
}

function getApiKey(): string {
  const key = process.env.ZAPSIGN_API_KEY;
  if (!key) {
    throw new ZapSignError(
      'ZAPSIGN_API_KEY not configured',
      500,
      'Set the ZAPSIGN_API_KEY environment variable.',
    );
  }
  return key;
}

/** Format CPF as ###.###.###-## from a digits-only string. */
function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, '').padStart(11, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Format CEP as #####-### from a digits-only string. */
function formatCep(raw: string): string {
  const d = raw.replace(/\D/g, '').padStart(8, '0');
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}

/** Current date formatted in Portuguese: "27 de fevereiro de 2026". */
function formatDatePtBr(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

// ─── markdown template ───────────────────────────────────────────────────────

export function buildProcuracaoMarkdown(params: CreateProcuracaoParams): string {
  const cpf = formatCpf(params.signerCpf);
  const addr = params.signerAddress;
  const cep = formatCep(addr.postalCode);

  const addressLine = [
    `${addr.street}, ${addr.number}`,
    addr.complement || '',
    `- ${addr.neighborhood}`,
    `- ${addr.city}/${addr.state}`,
    `- Cep: ${cep}`,
  ]
    .filter(Boolean)
    .join(' ');

  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.entouragelab.com'}/logo.png`;
  const date = formatDatePtBr();

  return `![Entourage PhytoLab](${logoUrl})

# PROCURAÇÃO

Eu, **${params.signerName}**, portador do CPF nº **${cpf}**, residente à ${addressLine}, por meio desta, nomeio e constituo como meu procurador o Sr. Caio Santos Abreu, portador do CPF nº 025.289.547-94, para que, em meu nome e na qualidade de meu representante legal, pratique os seguintes atos: (i) representar-me perante a Agência Nacional de Vigilância Sanitária (ANVISA) e quaisquer outras autoridades competentes, para todos os fins relacionados à obtenção de autorização de importação de produtos à base de cannabis, conforme os termos da RDC nº 660/2022 da ANVISA, incluindo o preenchimento do meu cadastro no portal do Governo Federal e solicitar a autorização de importação dos referidos produtos junto à ANVISA, bem como acompanhar o processo até a obtenção da referida autorização, (ii) realizar todos os atos necessários para efetivar a importação dos produtos à base de cannabis, incluindo, mas não se limitando ao processo de importação, desembaraço aduaneiro, e demais procedimentos junto à ANVISA, Receita Federal e demais autoridades competentes; (iii) receber, transportar e armazenar em meu nome os produtos importados à base de cannabis, garantindo que sejam mantidos em condições apropriadas, até sua entrega em minhas mãos. Esta procuração é válida por 1 (um) ano ou até que sejam cumpridos todos os atos necessários ao objeto desta procuração, o que ocorrer primeiro.

**${addr.city}**, **${date}**

---

&nbsp;

&nbsp;

&nbsp;

**${params.signerName}**
CPF: **${cpf}**`;
}

// ─── API call ────────────────────────────────────────────────────────────────

export async function createZapSignDocument(
  params: CreateProcuracaoParams,
): Promise<ZapSignDocumentResult> {
  const baseUrl = getBaseUrl();
  const apiKey = getApiKey();
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.entouragelab.com'}/logo.png`;

  const body = {
    name: `Procuração ANVISA — ${params.signerName}`,
    markdown_text: buildProcuracaoMarkdown(params),
    lang: 'pt-br',
    brand_logo: logoUrl,
    brand_name: 'Entourage PhytoLab',
    brand_primary_color: '#0d9488',
    external_id: params.orderId,
    // No automatic sending — link shown in UI only
    disable_signer_emails: true,
    signers: [
      {
        name: params.signerName,
        email: params.signerEmail || '',
        phone_country: params.signerPhoneCountry || '55',
        phone_number: params.signerPhone || '',
        auth_mode: 'assinaturaTela',
        send_automatic_email: false,
        send_automatic_whatsapp: false,
        lock_name: true,
        lock_email: false,
        lock_phone: false,
      },
    ],
  };

  console.log('[zapsign] Creating document for order', params.orderId);

  const res = await fetch(`${baseUrl}/api/v1/docs/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[zapsign] API error:', res.status, text);
    throw new ZapSignError(
      `ZapSign API returned ${res.status}`,
      res.status,
      text,
    );
  }

  const json = await res.json();

  const docToken = json.token;
  if (!docToken) {
    throw new ZapSignError('Response did not include a document token', 500);
  }

  const signer = json.signers?.[0];
  if (!signer?.sign_url) {
    throw new ZapSignError('Response did not include a signer sign_url', 500);
  }

  console.log('[zapsign] Document created:', docToken, '→', signer.sign_url);

  return {
    docId: docToken,
    signUrl: signer.sign_url,
    signerToken: signer.token || '',
    status: json.status || 'pending',
  };
}
