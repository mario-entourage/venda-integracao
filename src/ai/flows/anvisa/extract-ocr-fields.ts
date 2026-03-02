'use server';

/**
 * Uses Gemini's vision capabilities combined with Cloud Vision OCR text
 * to extract structured fields from uploaded document images/PDFs.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// ─── Brazilian Document Validators ──────────────────────────────────────────

const VALID_UF_CODES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

function validateCpfChecksum(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  const check1 = 11 - (sum % 11);
  if ((check1 > 9 ? 0 : check1) !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  const check2 = 11 - (sum % 11);
  return (check2 > 9 ? 0 : check2) === parseInt(digits[10]);
}

function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function normalizeCep(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function isValidDate(dateStr: string): boolean {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const [, dayStr, monthStr, yearStr] = match;
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeDate(value: string): string | null {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return isValidDate(value) ? value : null;

  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length === 8) {
    const formatted = digitsOnly.replace(/(\d{2})(\d{2})(\d{4})/, '$1/$2/$3');
    return isValidDate(formatted) ? formatted : null;
  }

  const dashDot = value.replace(/[-\.]/g, '/');
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dashDot)) return isValidDate(dashDot) ? dashDot : null;

  const parts = value.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const padded = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.length === 2 ? '20' + y : y}`;
    return isValidDate(padded) ? padded : null;
  }

  return null;
}

function normalizeCrm(value: string): { crm: string; uf: string } | null {
  const cleaned = value.toUpperCase().replace(/CRM[\s\-\/]*/gi, '').trim();
  const patterns = [
    /^(\d{4,6})[\s\-\/]*([A-Z]{2})$/,
    /^([A-Z]{2})[\s\-\/]*(\d{4,6})$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const [, first, second] = match;
      const isFirstDigits = /^\d+$/.test(first);
      const crm = isFirstDigits ? first : second;
      const uf = isFirstDigits ? second : first;
      if (VALID_UF_CODES.includes(uf)) return { crm, uf };
    }
  }

  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length >= 4 && digitsOnly.length <= 6) return { crm: digitsOnly, uf: '' };

  return null;
}

// ─── Post-processing ────────────────────────────────────────────────────────

function postProcessFields(output: ExtractOcrFieldsOutput): ExtractOcrFieldsOutput {
  const fields = { ...output.extractedFields };
  const confidence = { ...output.fieldConfidence };
  const missing = [...output.missingCriticalFields];

  // CPF
  if (fields.patientCpf) {
    const normalized = normalizeCpf(fields.patientCpf);
    if (normalized) {
      fields.patientCpf = normalized;
      if (validateCpfChecksum(normalized)) {
        confidence.patientCpf = Math.min((confidence.patientCpf || 0.5) + 0.15, 1.0);
      } else {
        confidence.patientCpf = Math.max((confidence.patientCpf || 0.5) - 0.2, 0.1);
      }
    }
  }

  // CEP
  if (fields.patientCep) {
    const normalized = normalizeCep(fields.patientCep);
    if (normalized) {
      fields.patientCep = normalized;
      confidence.patientCep = Math.min((confidence.patientCep || 0.5) + 0.1, 1.0);
    }
  }

  // Dates
  if (fields.patientDob) {
    const normalized = normalizeDate(fields.patientDob);
    if (normalized) {
      fields.patientDob = normalized;
      confidence.patientDob = Math.min((confidence.patientDob || 0.5) + 0.1, 1.0);
    } else {
      confidence.patientDob = Math.max((confidence.patientDob || 0.5) - 0.2, 0.1);
    }
  }

  if (fields.prescriptionDate) {
    const normalized = normalizeDate(fields.prescriptionDate);
    if (normalized) {
      fields.prescriptionDate = normalized;
      confidence.prescriptionDate = Math.min((confidence.prescriptionDate || 0.5) + 0.1, 1.0);
    } else {
      confidence.prescriptionDate = Math.max((confidence.prescriptionDate || 0.5) - 0.2, 0.1);
    }
  }

  // CRM + UF
  if (fields.doctorCrm) {
    const normalized = normalizeCrm(fields.doctorCrm);
    if (normalized) {
      fields.doctorCrm = normalized.crm;
      if (normalized.uf && !fields.doctorUf) {
        fields.doctorUf = normalized.uf;
        confidence.doctorUf = confidence.doctorCrm || 0.7;
      }
      confidence.doctorCrm = Math.min((confidence.doctorCrm || 0.5) + 0.1, 1.0);
    }
  }

  // Patient state (UF)
  if (fields.patientState) {
    const uf = fields.patientState.toUpperCase().trim();
    if (VALID_UF_CODES.includes(uf)) {
      fields.patientState = uf;
      confidence.patientState = Math.min((confidence.patientState || 0.5) + 0.1, 1.0);
    } else {
      const stateNameMap: Record<string, string> = {
        'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amapá': 'AP', 'amazonas': 'AM',
        'bahia': 'BA', 'ceara': 'CE', 'ceará': 'CE', 'distrito federal': 'DF',
        'espirito santo': 'ES', 'espírito santo': 'ES', 'goias': 'GO', 'goiás': 'GO',
        'maranhao': 'MA', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
        'minas gerais': 'MG', 'para': 'PA', 'pará': 'PA', 'paraiba': 'PB', 'paraíba': 'PB',
        'parana': 'PR', 'paraná': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'piauí': 'PI',
        'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
        'rondonia': 'RO', 'rondônia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
        'sao paulo': 'SP', 'são paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
      };
      const normalized = stateNameMap[uf.toLowerCase()];
      if (normalized) {
        fields.patientState = normalized;
        confidence.patientState = Math.min((confidence.patientState || 0.5) + 0.05, 1.0);
      } else {
        confidence.patientState = 0.2;
      }
    }
  }

  // Doctor UF
  if (fields.doctorUf) {
    const uf = fields.doctorUf.toUpperCase().trim();
    if (VALID_UF_CODES.includes(uf)) {
      fields.doctorUf = uf;
      confidence.doctorUf = Math.min((confidence.doctorUf || 0.5) + 0.1, 1.0);
    } else {
      confidence.doctorUf = 0.2;
    }
  }

  return { extractedFields: fields, fieldConfidence: confidence, missingCriticalFields: missing };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const ExtractOcrFieldsInputSchema = z.object({
  documentType: z.enum(['DOCUMENTO_PACIENTE', 'COMPROVANTE_RESIDENCIA', 'PROCURACAO', 'RECEITA_MEDICA'])
    .describe('The type of document being processed.'),
  fileUrl: z.string()
    .describe('The download URL of the document file in Firebase Storage.'),
  contentType: z.string()
    .describe('The MIME type of the file (e.g., application/pdf, image/jpeg).'),
  ocrText: z.string().optional()
    .describe('Raw OCR text from Google Cloud Vision API, if available.'),
});
export type ExtractOcrFieldsInput = z.infer<typeof ExtractOcrFieldsInputSchema>;

const ExtractOcrFieldsOutputSchema = z.object({
  extractedFields: z.object({
    patientName: z.string().optional().describe('Full name of the patient.'),
    patientRg: z.string().optional().describe('RG (Registro Geral) number from the ID card.'),
    patientCpf: z.string().optional().describe('CPF in format 000.000.000-00.'),
    patientDob: z.string().optional().describe('Date of birth in DD/MM/YYYY format.'),
    patientCep: z.string().optional().describe('CEP in format 00000-000.'),
    patientAddress: z.string().optional().describe('Full street address including number.'),
    patientState: z.string().optional().describe('Brazilian state (UF) 2-letter code.'),
    patientCity: z.string().optional().describe('City/municipality name.'),
    patientPhone: z.string().optional().describe('Patient phone number.'),
    patientEmail: z.string().optional().describe('Patient email address.'),
    doctorName: z.string().optional().describe('Full name of the doctor.'),
    doctorCrm: z.string().optional().describe('CRM registration number (digits only).'),
    doctorSpecialty: z.string().optional().describe('Medical specialty.'),
    doctorUf: z.string().optional().describe('State (UF) where the doctor practices.'),
    doctorCity: z.string().optional().describe('City where the doctor practices.'),
    doctorPhone: z.string().optional().describe('Doctor landline phone.'),
    doctorMobile: z.string().optional().describe('Doctor mobile phone.'),
    doctorEmail: z.string().optional().describe('Doctor email address.'),
    prescriptionDate: z.string().optional().describe('Prescription date in DD/MM/YYYY format.'),
    prescriptionMedication: z.string().optional().describe('Name of the prescribed medication.'),
    prescriptionDosage: z.string().optional().describe('Dosage/posology instructions.'),
  }).describe('The structured fields extracted from the document.'),
  fieldConfidence: z.record(z.number().min(0).max(1))
    .describe('Confidence score from 0.0 to 1.0 for each extracted field.'),
  missingCriticalFields: z.array(z.string())
    .describe('List of field names that could not be found in the document.'),
});
export type ExtractOcrFieldsOutput = z.infer<typeof ExtractOcrFieldsOutputSchema>;

// ─── System prompt ──────────────────────────────────────────────────────────

const systemPrompt = `You are a document data extraction specialist for Brazilian medical and patient documents.
You will be shown a document image or PDF. Extract ALL fields you can clearly identify, regardless of document type.

Each document type has PRIMARY fields (most likely to be found there), but you should ALSO extract any OTHER recognizable fields:

Primary field mapping:
- DOCUMENTO_PACIENTE: patientName, patientRg, patientCpf, patientDob, patientCep, patientState, patientPhone, patientEmail
- COMPROVANTE_RESIDENCIA: patientName, patientCpf, patientCep, patientAddress, patientCity, patientState (primary source for address)
- PROCURACAO: patientName, patientRg, patientCpf, patientDob, patientState, patientCity, patientAddress, patientCep
- RECEITA_MEDICA: prescriptionMedication, prescriptionDosage, doctorName, doctorCrm, doctorSpecialty, doctorUf, doctorCity, doctorPhone, doctorMobile, doctorEmail, prescriptionDate

IMPORTANT: If you see ANY field from the full list clearly in the document, extract it — even if it is NOT a primary field for that document type.

EXTRACTION RULES:
1. Extract ALL fields you can clearly identify in the document, not just the primary ones for its type.
2. Format CPF as 000.000.000-00 (insert dots and dash if missing).
3. Format CEP as 00000-000 (insert dash if missing).
4. Format dates as DD/MM/YYYY. If a date is in another format, convert it.
5. UF must be exactly 2 uppercase letters (e.g., SP, RJ, MG).
6. CRM should be the numeric portion only, without "CRM" prefix.
7. Do NOT hallucinate or invent data. If a field is not in the document, omit it from extractedFields and add it to missingCriticalFields.

CONFIDENCE SCORING:
For each field you extract, assign a confidence score between 0.0 and 1.0:
- 1.0 = clearly present and unambiguous in the document
- 0.7-0.9 = present but required minor interpretation or formatting
- 0.5-0.7 = partially visible, may be cut off or slightly unclear
- 0.3-0.5 = difficult to read but identifiable
- Below 0.3 = very uncertain, significant guessing involved

LOW-QUALITY IMAGE HANDLING:
When dealing with poor image quality (blurry, faded, low contrast):
- Focus MORE on your own visual analysis rather than corrupted OCR text
- Use document layout and structure as position hints for fields
- Look for form field labels to identify where data should appear
- Apply contextual clues about Brazilian document formats
- If a character is ambiguous, consider what makes sense in context (e.g., 0 vs O in numbers)

BRAZILIAN DOCUMENT PATTERNS:
- CPF: Always 11 digits, follows checksum validation (e.g., 123.456.789-09)
- CEP: Always 8 digits, first digit indicates region (0-9 → different states)
- CRM: 4-6 digits + 2-letter state code (e.g., 12345/SP or CRM-SP 12345)
- Dates: Common formats to convert: DD-MM-YYYY, DD.MM.YYYY, D/M/YY, DDMMYYYY
- Valid UF codes: AC, AL, AP, AM, BA, CE, DF, ES, GO, MA, MT, MS, MG, PA, PB, PR, PE, PI, RJ, RN, RS, RO, RR, SC, SP, SE, TO

PATIENT RG (patientRg) — CRITICAL FIELD:
- The RG is found on the BACK of the ID card, near the TOP, labeled "RG" or "REGISTRO GERAL".
- Extract it EXACTLY as printed on the card, including any state prefix, dots, dashes, and check digit letters.
- Do NOT confuse it with the CPF (which is always 11 digits in XXX.XXX.XXX-XX format).

PATIENT DATE OF BIRTH (patientDob) — CRITICAL FIELD:
- Found on the BACK of the ID card, labeled "DATA DE NASCIMENTO" or "NASCIMENTO" or "D.NASC".
- Always convert it to DD/MM/YYYY format.

PATIENT STATE (patientState) — CRITICAL FIELD:
- The Brazilian state (UF) where the patient lives, as a 2-letter uppercase code.
- Found on ID cards (front and back) and proof of residency documents.

PROOF OF RESIDENCY (COMPROVANTE DE RESIDENCIA) TIPS:
- patientAddress MUST include the street name AND house/apartment number.
- CEP (postal code) is usually printed near the address.

PRESCRIPTION MEDICATION AND DOSAGE — CRITICAL FIELDS:
- prescriptionMedication: the name of the prescribed product/medication.
- prescriptionDosage: the posology/dosage instructions.
- These are the MOST IMPORTANT fields from a prescription for the ANVISA import process.

OCR TEXT USAGE:
You may receive raw OCR text extracted by Google Cloud Vision. Use it as a SUPPLEMENT:
- When OCR text contains a value you cannot clearly see in the image, consider the OCR reading
- When the image clearly shows something different from the OCR text, prefer your visual reading`;

// ─── Main function ──────────────────────────────────────────────────────────

export async function extractOcrFields(input: ExtractOcrFieldsInput): Promise<ExtractOcrFieldsOutput> {
  const model =
    input.documentType === 'RECEITA_MEDICA'
      ? 'googleai/gemini-2.5-pro'
      : 'googleai/gemini-2.5-flash';

  const promptParts: any[] = [
    { media: { url: input.fileUrl, contentType: input.contentType } },
  ];

  let textPrompt = `This is a ${input.documentType} document. Extract the relevant structured fields from it.`;

  if (input.ocrText && input.ocrText.trim().length > 0) {
    const truncatedOcr =
      input.ocrText.length > 5000
        ? input.ocrText.substring(0, 5000) + '\n... [truncated]'
        : input.ocrText;
    textPrompt += `\n\nThe following raw OCR text was extracted from this document by Google Cloud Vision API. Use it as supplementary context:\n\n---\n${truncatedOcr}\n---`;
  }

  promptParts.push({ text: textPrompt });

  const { output } = await ai.generate({
    model,
    system: systemPrompt,
    prompt: promptParts,
    output: { schema: ExtractOcrFieldsOutputSchema },
  });

  return postProcessFields(output!);
}
