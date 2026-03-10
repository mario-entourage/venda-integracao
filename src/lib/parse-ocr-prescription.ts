/**
 * Parses raw OCR text from a Brazilian medical prescription and extracts
 * structured product rows.
 *
 * Strategy:
 *   1. Normalise lines (lowercase, collapse spaces)
 *   2. Skip metadata lines (CRM, dr., paciente, data, etc.)
 *   3. Identify product lines (contain dosage or quantity unit tokens)
 *   4. Try to match against the internal product catalog (SKU lookup)
 */

export interface OcrProductRow {
  id: string;
  stockProductId: string;
  productName: string;
  quantity: string;
  price: string;
  discount: string;
}

interface CatalogEntry {
  sku: string;
  name: string;
  concentration?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Words whose presence marks a line as prescription metadata, not a product. */
const METADATA_KEYWORDS = [
  'crm', 'dr.', 'dra.', 'paciente', 'nome:', 'data:', 'assinatura',
  'carimbo', 'hospital', 'clínica', 'clinica', 'receituário', 'receituario',
  'médico', 'medico', 'telefone', 'fone:', 'endereço', 'endereco', 'cep:',
  'cpf:', 'cpf', 'rg:', 'rg', 'especialidade', 'validade',
  'prescrição', 'prescricao', 'posologia', 'indicação', 'indicacao',
];

/**
 * Matches Portuguese quantity patterns:
 *   "1 caixa", "2 caixas", "30 comprimidos", "1 frasco", "1 ampola" …
 * Group 1 = numeric value, group 2 = unit word.
 */
const QTY_UNIT_RE =
  /\b(\d+)\s*(caixa[s]?|frasco[s]?|ampola[s]?|comprimido[s]?|drágea[s]?|dragea[s]?|sach[eê][s]?|unidade[s]?|unid\.?|cp[s]?)\b/i;

/**
 * Matches dosage suffixes like "500mg", "1g", "30ml", "100mcg", "10ui".
 * Their presence strongly suggests the line is a medication line.
 */
const DOSAGE_RE = /\d+\s*(mg|mcg|g\b|ml|ui|iu|%)/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMetadataLine(line: string): boolean {
  const n = normalise(line);
  return METADATA_KEYWORDS.some((kw) => n.includes(normalise(kw)));
}

function looksLikeProductLine(line: string): boolean {
  return DOSAGE_RE.test(line) || QTY_UNIT_RE.test(line);
}

function extractQuantity(line: string): string {
  // 1. Explicit quantity + unit (e.g. "2 caixas")
  const unitMatch = line.match(QTY_UNIT_RE);
  if (unitMatch) return unitMatch[0].trim();

  // 2. Numeric prefix (e.g. "1 -" at line start)
  const numMatch = line.match(/^\s*(\d+)\b/);
  if (numMatch) return numMatch[1];

  return 'n/a';
}

function tryMatchCatalog(productName: string, catalog: CatalogEntry[]): string {
  const n = normalise(productName);

  for (const p of catalog) {
    // Exact SKU substring
    if (n.includes(normalise(p.sku))) return p.sku;
  }

  for (const p of catalog) {
    const pn = normalise(p.name);
    const pc = normalise(p.concentration ?? '');
    if (n.includes(pn) || pn.includes(n)) return p.sku;
    if (pc && n.includes(pc)) return p.sku;
  }

  return 'n/a';
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parses raw OCR text and returns one `OcrProductRow` per detected product line.
 * Returns an empty array when no product lines are found.
 */
export function parseOcrPrescription(
  rawText: string,
  catalog: CatalogEntry[],
): OcrProductRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 3);

  const rows: OcrProductRow[] = [];

  for (const line of lines) {
    if (isMetadataLine(line)) continue;
    if (!looksLikeProductLine(line)) continue;

    const qty = extractQuantity(line);

    // Strip the quantity token to get a cleaner product name
    const productName = line
      .replace(QTY_UNIT_RE, '')
      .replace(/[-–—:,]+$/, '')
      .replace(/\s+/g, ' ')
      .trim() || line.trim();

    const stockProductId = tryMatchCatalog(productName, catalog);

    rows.push({
      id: crypto.randomUUID(),
      stockProductId,
      productName,
      quantity: qty,
      price: 'n/a',
      discount: 'n/a',
    });
  }

  return rows;
}
