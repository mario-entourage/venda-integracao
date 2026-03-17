# QA Document

> Entourage Lab — Sales Integration Platform
> Last updated: 2026-03-17

---

## 1. Overview

This document describes the quality assurance strategy for the Entourage Lab Sales Integration Platform. It covers the automated test suite, what is tested, what is not yet tested, how to run the tests, and a manual QA checklist for features that cannot be verified through automation alone.

**Current state:** 113 automated unit tests across 5 test files, covering all critical business logic and external integration modules. All tests pass. Total execution time: ~300ms.

---

## 2. Test Infrastructure

| Component | Details |
|---|---|
| **Framework** | Vitest 4.0.18 |
| **Language** | TypeScript (strict mode) |
| **Environment** | Node.js |
| **Path aliases** | `@/` resolves to `./src/` (via `vitest.config.ts`) |
| **Coverage provider** | `@vitest/coverage-v8` (installed, available via `npm run test:coverage`) |
| **Mocking** | `vi.fn()`, `vi.mock()`, `vi.stubGlobal()` for fetch and Firebase Admin SDK |

### How to run

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file change)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### Configuration

- `vitest.config.ts` — Test runner config with path alias resolution
- `package.json` — Scripts: `test`, `test:watch`, `test:coverage`

---

## 3. Automated Test Suite

### 3.1 Test Summary

| Test File | Tests | Source File(s) | What It Covers |
|---|---|---|---|
| `src/lib/order-status-helpers.test.ts` | 39 | `order-status-helpers.ts` (161 lines) | Order readiness predicate, granular status computation, status constants |
| `src/server/integrations/bcb-ptax.test.ts` | 12 | `bcb-ptax.ts` (163 lines) | Exchange rate fetching, retry logic, caching, error handling |
| `src/server/integrations/globalpay.test.ts` | 17 | `globalpay.ts` (353 lines) | Payment link creation, auth flow, token caching, auto-retry, error mapping |
| `src/server/integrations/zapsign.test.ts` | 26 | `zapsign.ts` (261 lines) | Markdown document generation, API calls, sandbox mode, error handling |
| `src/server/integrations/webhooks.test.ts` | 19 | `payment/route.ts` (153 lines), `zapsign/route.ts` (114 lines) | Webhook payload parsing, status detection, idempotency, token matching |
| **Total** | **113** | **1,205 lines of source** | |

Test code: 1,710 lines. Source code under test: 1,205 lines. Ratio: 1.42:1.

---

### 3.2 Order Status Helpers — 39 Tests

**File:** `src/lib/order-status-helpers.test.ts`

This is the most critical module in the platform. The `isReadyToShip()` predicate and `getGranularStatus()` function drive the entire Pedidos UI — which actions to show, how orders are highlighted, and what status badges appear.

#### `isReadyToShip()` — 16 tests

The predicate returns `true` only when ALL five conditions are met:

| # | Test Case | Expected |
|---|---|---|
| 1 | Brand new pending order | `false` |
| 2 | Status is not "paid" (e.g., awaiting_payment) | `false` |
| 3 | Documents are not complete | `false` |
| 4 | ANVISA required but not concluded | `false` |
| 5 | ANVISA regular with undefined status | `false` |
| 6 | ANVISA is exempt | `true` |
| 7 | ANVISA status is "CONCLUIDO" (uppercase) | `true` |
| 8 | ANVISA status is "concluido" (lowercase) | `true` |
| 9 | Procuracao exists but not signed | `false` |
| 10 | Procuracao exists and IS signed | `true` |
| 11 | Comprovante de Vinculo exists but not signed | `false` |
| 12 | Comprovante de Vinculo exists and IS signed | `true` |
| 13 | BOTH ZapSign docs exist, only one signed | `false` |
| 14 | BOTH ZapSign docs exist, both signed | `true` |
| 15 | No ZapSign docs created at all | `true` |
| 16 | Golden path: paid + docs + ANVISA done + both signed | `true` |

#### `getGranularStatus()` — 19 tests

| Category | Tests | Coverage |
|---|---|---|
| Terminal statuses | 3 | Shipped, delivered, cancelled return base labels with empty missing array |
| Missing item detection | 10 | Payment, documents, ANVISA (with/without request ID), ANVISA exempt, Procuracao, Comprovante |
| Combined missing items | 4 | All items missing, no items missing (fully resolved), "falta" configKey, joined label format |
| Edge cases | 2 | ANVISA exempt skips check, signed ZapSign docs are not flagged |

#### Constants and config — 4 tests

| Test | What It Verifies |
|---|---|
| IN_PROGRESS_STATUSES has exactly 6 entries | No terminal statuses accidentally included |
| BASE_LABELS covers all OrderStatus values | No missing translations |
| EXTENDED_STATUS_CONFIG includes "falta" and "pronto" | Custom status keys exist |
| All config entries have label and className | No broken styling references |

---

### 3.3 BCB PTAX Exchange Rate — 12 Tests

**File:** `src/server/integrations/bcb-ptax.test.ts`

Uses mocked `fetch` with module reset between tests to clear the in-memory cache.

| Category | Tests | Coverage |
|---|---|---|
| Successful fetches | 3 | Correct mid-rate calculation, 5-decimal rounding, last intraday entry selection |
| Retry logic | 4 | Walks back days on empty response, throws after max retries, continues past HTTP 503, continues past network errors |
| Custom maxRetries | 1 | Respects the `maxRetries` parameter |
| Caching | 2 | Caches "today" lookups (single fetch call on repeat), does NOT cache historical lookups |
| URL construction | 2 | Date formatted as MM-DD-YYYY, includes `$format=json` |

**Key business logic verified:**
- Mid-rate = (buyRate + sellRate) / 2, rounded to 5 decimal places
- Weekend/holiday retry walks back up to 7 days
- Cache TTL is 30 minutes for "today" lookups only
- Network and HTTP errors are non-fatal (continue to next day)

---

### 3.4 GlobalPay Payment Integration — 17 Tests

**File:** `src/server/integrations/globalpay.test.ts`

Uses mocked `fetch` with environment variables set per test.

| Category | Tests | Coverage |
|---|---|---|
| Happy path | 5 | Auth + order creation, correct auth payload (pubKey + merchantCode), Bearer token header, customer data in body, payment methods array |
| Token caching | 1 | Reuses cached token (single auth call for multiple orders) |
| Auto-retry on 401 | 2 | Retries once with fresh token, throws after second 401 |
| Error handling | 4 | Missing GLOBALPAY_PUB_KEY, auth endpoint failure, missing payment URL, known error code → Portuguese message |
| Unknown errors | 1 | Falls back to raw message for unmapped error codes |
| Transaction queries | 2 | Query by gpOrderId, throws on API error |
| Transaction cancellation | 2 | Cancel by gpOrderId, throws on cancellation failure |

**Key business logic verified:**
- Success is `statusCode === 1` (not HTTP 200)
- Token is cached with 60-second pre-expiry refresh
- Auto-retry clears cache on 401 then re-authenticates
- Error code 340 → "Valor (amount) deve ser maior ou igual a 1."

---

### 3.5 ZapSign E-Signature Integration — 26 Tests

**File:** `src/server/integrations/zapsign.test.ts`

#### Procuracao Markdown — 9 tests

| Test | What It Verifies |
|---|---|
| CPF formatting | `12345678901` → `123.456.789-01` |
| CEP formatting | `01234567` → `01234-567` |
| Signer name in document | Name appears in legal text |
| Full address | Street, number, neighborhood, city/state |
| Title | `# PROCURAÇÃO` heading |
| Named attorney | Caio Santos Abreu + CPF `025.289.547-94` |
| Legal text | Mentions ANVISA and RDC |
| Logo URL | Uses `NEXT_PUBLIC_APP_URL` env var |
| Short CPF padding | `123` → `000.000.001-23` (padded to 11 digits) |

#### Comprovante de Vinculo Markdown — 5 tests

| Test | What It Verifies |
|---|---|
| Title | `# COMPROVANTE DE VÍNCULO` heading |
| Two-person format | Both signer and client names present |
| Both CPFs formatted | Signer and client CPFs both formatted correctly |
| Address with CEP | Full address including complement and CEP |
| Fallback | Uses signer info when clientInfo is not provided |

#### API Calls — 8 tests

| Test | What It Verifies |
|---|---|
| Procuracao creation | Returns docId, signUrl, signerToken, status |
| Comprovante creation | Sets correct document name and external_id |
| Request format | Correct URL, POST method, Bearer auth header |
| Sandbox mode | Reads `ZAPSIGN_SANDBOX` env var |
| Signer config | `auth_mode: 'assinaturaTela'`, no auto-email, no auto-WhatsApp |
| External ID | Set to orderId for webhook correlation |
| Language | Set to `pt-br` |

#### Error Handling — 4 tests

| Test | What It Verifies |
|---|---|
| Missing API key | Throws `ZapSignError` with message about `ZAPSIGN_API_KEY` |
| HTTP error (403) | Throws with status code in message |
| Missing document token | Throws on malformed response |
| Missing sign_url | Throws when signer has no sign URL |

---

### 3.6 Webhook Handlers — 19 Tests

**File:** `src/server/integrations/webhooks.test.ts`

Tests the core business logic of both webhook handlers without requiring a running Next.js server or Firebase connection. Firebase Admin SDK is mocked.

#### Payment Webhook Logic — 8 tests

| Test | What It Verifies |
|---|---|
| Approved statuses | `approved`, `paid`, `completed`, `success` recognized; `failed`, `pending`, `cancelled` rejected |
| Order ID parsing | Extracted from `invoice` field (primary) |
| Fallback parsing | Falls back to `referenceId` when `invoice` is absent |
| Final status detection | `paid`, `shipped`, `delivered` are final (skip update) |
| Status normalization | `"APPROVED"` → `"approved"` (case-insensitive) |
| Empty invoice handling | Returns empty string without crashing |

#### ZapSign Webhook Logic — 8 tests

| Test | What It Verifies |
|---|---|
| Signing event detection | `doc_signed` action OR `signed` status → is signed |
| Status-only detection | `doc_updated` + status `signed` → is signed |
| Non-signing event filtering | `doc_viewed`, `doc_refused`, empty action → not signed |
| Procuracao token matching | Matches `docToken` against `order.zapsignDocId` |
| Comprovante token matching | Matches `docToken` against `order.zapsignCvDocId` |
| Token mismatch detection | Neither match → should return 400 |
| Procuracao idempotency | Already `signed` → skip update |
| Comprovante idempotency | Already `signed` → skip update |

#### Payload Parsing Edge Cases — 3 tests

| Test | What It Verifies |
|---|---|
| GlobalPay dual ID parsing | `invoice` → our orderId, `orderId` → GP transaction ID |
| ZapSign payload structure | Nested `document.token`, `document.external_id`, `document.status` |
| Status variation handling | Case variations and whitespace normalized correctly |

---

## 4. What Is NOT Tested (Gaps)

### 4.1 Not covered by automated tests

| Area | Reason | Risk |
|---|---|---|
| **Firestore CRUD operations** (`src/services/`) | Requires Firebase Emulator or real Firestore connection. Mocking Firestore is fragile and doesn't validate query semantics. | Medium — atomic batch write logic in `createOrder()` is the most complex write operation. |
| **React components** (`src/components/`) | No React testing library installed. Components are primarily UI wrappers around shadcn/ui primitives. | Low — UI bugs are caught during manual testing. |
| **Next.js pages** (`src/app/(app)/`) | Server components with Firestore subscriptions. Testing requires full Next.js test server. | Low — page-level logic is thin; business logic is in services/lib. |
| **Chrome extension** (`extensao-anvisa/`) | Runs in browser context against gov.br DOM. Cannot be unit tested. | High — ANVISA portal DOM changes will silently break it. |
| **AI/OCR pipeline** (`functions/src/`) | Cloud Function triggered by Storage upload. Requires Google Vision API and Gemini. | Medium — OCR accuracy depends on image quality. |
| **End-to-end flows** | No E2E framework (Cypress, Playwright) installed. | Medium — integration between modules not verified automatically. |

### 4.2 Recommended additions (priority order)

1. **Firebase Emulator integration tests** — Test `createOrder()` atomic batch, query filters, and subcollection operations against the local emulator. Highest ROI for catching data-layer bugs.

2. **E2E smoke tests** (Playwright) — Login → create sale → verify order appears in Pedidos. Catches integration issues between pages.

3. **Chrome extension regression tests** — Snapshot the expected ANVISA portal DOM selectors. Alert when gov.br changes break them. This is the highest-risk area.

4. **AI/OCR accuracy tests** — Run a set of reference images through the OCR pipeline and compare extracted fields against known-good values. Catches model regressions.

---

## 5. Manual QA Checklist

Use this checklist when deploying significant changes. Each item should be verified by an operator in the production environment.

### 5.1 Nova Venda (New Sale) Flow

- [ ] **Step 0 — Identification**: Select existing client, doctor, representative (from users with `isRepresentante` flag). Add 2+ products with custom pricing. Set frete (shipping cost). Upload a prescription image. Verify PTAX rate appears.
- [ ] **Step 0 — Frete**: Set a frete value. Verify it appears in the payment total on Step 2 and in the Step 4 summary.
- [ ] **Step 0 — Rep dropdown**: Verify that users tagged as sales reps appear in the Representante dropdown. Verify "Venda Direta" option is available.
- [ ] **Step 0 — Product dropdown width**: Open the Produto dropdown. Verify full product names are visible without truncation (dropdown expands beyond the trigger width up to 400px).
- [ ] **Step 0 — Drag feedback (green zone)**: Drag a file from the desktop onto the page. Verify the Receita drop zone highlights green with pulsing border, shows a green upload icon, and displays "Solte a receita aqui!" text.
- [ ] **Step 0 — Drag feedback (red zone, level 1)**: While dragging a file on the page (but NOT over the Produtos area), verify the Produtos area shows a light red overlay with a prohibition icon and "Não solte aqui" text.
- [ ] **Step 0 — Drag feedback (red zone, level 2)**: Move the dragged file INTO the Produtos area. Verify the overlay escalates to bold red with 4 large "NÃO!" texts. Move the file OUT of the Produtos area — verify it de-escalates back to the small prohibition icon.
- [ ] **Step 0 — Drag feedback (drop)**: Drop the file on the green Receita zone. Verify the file is accepted and the prescription preview appears. Verify both overlays disappear.
- [ ] **Step 1 — Shipping**: Set frete value. Select shipping method. Enter shipping address. Verify data persists to Step 4 summary.
- [ ] **Step 2 — Payment**: Generate GlobalPay payment link. Toggle payment methods. Verify link URL is generated with invoice in `ETGANS#####` format.
- [ ] **Step 3 — Documents**: Create Comprovante de Vinculo with Signatario details. Verify ZapSign document is created and signing URL appears.
- [ ] **Step 4 — Send to Client**: Verify summary shows all created links. Click WhatsApp share button — verify message contains payment link + signing URL.
- [ ] **Atomic creation**: After completing the wizard, verify the order appears in Pedidos with all subcollections populated (customer, doctor, representative, products, paymentLinks).
- [ ] **Invoice format**: Verify the generated invoice number follows `ETGANS#####` format (e.g., `ETGAMB00042`) where N and S are the rep's initials.
- [ ] **Duplicate Receita (block)**: Upload a prescription that is already linked to an active order. Verify the wizard shows an error with the conflicting order ID and a link to the existing order. Verify the "Próximo" button does not advance.
- [ ] **Duplicate Receita (admin override)**: As an admin, trigger the duplicate Receita error. Verify an amber checkbox "Permitir receita duplicada" appears. Check the box and click "Próximo" — verify the wizard advances despite the duplicate.
- [ ] **Duplicate Receita (non-admin)**: As a non-admin user, trigger the duplicate Receita error. Verify no override checkbox appears — the user must cancel the existing order first.
- [ ] **Duplicate Receita (file swap)**: After triggering the duplicate error, upload a different prescription file. Verify the error clears automatically.

### 5.1a Multi-File Upload & AI Classification (Controle Detail)

- [ ] **Multi-file drop**: Drag 3+ files onto the upload area on an order detail page. Verify all files upload sequentially with per-file progress indicators.
- [ ] **AI classification**: After upload, verify each file shows a "Classificando..." spinner followed by the detected document type (e.g., "Identidade", "Comprovante de Endereço", "Receita"). Verify incorrect classifications can be overridden via the type dropdown.
- [ ] **Field extraction**: Upload a patient ID image. Verify AI extracts structured fields (fullName, CPF, RG, birthDate, address). Verify extracted data appears inline.
- [ ] **Cross-document merge**: Upload multiple documents (e.g., ID + proof of address). Verify the system merges extracted data intelligently — address from proof of address, identity from ID.
- [ ] **Profile update suggestion**: After extraction, verify the system offers to update client/doctor records with extracted data. Verify a visual diff shows current vs. extracted values.

### 5.1b Doctor-Rep Association

- [ ] **Doctor form**: Navigate to /medicos/novo or /medicos/[id]. Verify a "Representante" dropdown appears. Select a rep and save. Verify it persists on reload.
- [ ] **Doctor list**: Navigate to /medicos. Verify the "Representante" column shows the resolved rep name (not raw UID). Doctors without a rep show a blank or dash.
- [ ] **Wizard auto-fill**: In Nova Venda, select a doctor that has an assigned rep. Verify the Representante field auto-fills with that rep. Verify the operator can still change it manually.
- [ ] **AI auto-fill**: Upload a prescription. If the AI matches a doctor with an assigned rep, verify the rep auto-fills.

### 5.1c Shipping Choice & Email Notifications

- [ ] **Post-finalization dialog**: Complete the Nova Venda wizard. Verify a shipping choice dialog appears with two options: "TriStar Express" and "Enviar do Brasil".
- [ ] **TriStar option**: Click "TriStar Express". Verify it opens the TriStar shipment dialog pre-populated with order data.
- [ ] **Brazil option**: Click "Enviar do Brasil". Verify an email notification is sent to adm@entouragelab.com with the order summary (order ID, client name, amount, products).
- [ ] **Rep notification (TriStar)**: Ship a rep-assigned order via TriStar. Verify the assigned rep receives an email notification with the tracking code and order details.
- [ ] **No API key graceful**: If RESEND_API_KEY is not configured, verify the system logs a warning but does not throw an error. The order flow should complete normally.

### 5.2 Pedidos (Order Tracker)

- [ ] **Invoice display**: Verify orders with invoice numbers show the `ETGANS#####` format prominently. Orders without invoices show a truncated order ID.
- [ ] **Rep display**: Verify each order row shows the assigned representative's name.
- [ ] **Status filters**: Switch between "Todos em andamento", "Pronto p/ envio", and individual statuses. Verify correct orders appear.
- [ ] **Granular badges**: Verify unpaid orders show "Falta Pagamento", orders missing ANVISA show "Falta ANVISA", exempt orders do NOT show "Falta ANVISA".
- [ ] **Ready-to-ship highlight**: Create an order that meets all 5 conditions (paid, docs complete, ANVISA exempt/concluded, ZapSign signed). Verify it has emerald accent styling.
- [ ] **Pre-ship actions**: For orders NOT ready to ship, verify Mark as Paid, upload Documents, ANVISA, and ZapSign buttons appear.
- [ ] **Shipping actions**: For orders that ARE ready to ship, verify TriStar, Correios, and Motoboy shipping buttons appear.
- [ ] **Regenerate payment link**: Click "Regenerar link" on an order. Verify a new invoice number is generated and the payment link is recreated.
- [ ] **Batch operations** (admin only): Select multiple orders, click delete. Verify confirmation dialog appears and soft-deletes work.

### 5.3 Payment Webhook

- [ ] **End-to-end payment**: Complete a payment through the GlobalPay checkout page. Verify the order status changes to "paid" in Pedidos within 30 seconds.
- [ ] **Idempotency**: Trigger the webhook twice for the same payment. Verify no duplicate payment records are created and order status is not corrupted.
- [ ] **Payment audit**: Check the `payments` subcollection — verify a payment record was created with provider, amount, status, and timestamp.

### 5.4 ZapSign Webhook

- [ ] **End-to-end signing**: Open the signing URL as if you were the client. Complete the signature. Verify the order's `zapsignCvStatus` changes to "signed" in the platform.
- [ ] **Idempotency**: Trigger the webhook twice. Verify no errors and the status remains "signed".

### 5.4a Controle (Order Detail)

- [ ] **Rep selector**: Verify the order detail page shows a representative dropdown. Change the rep and verify the change persists.
- [ ] **Document type selector**: Upload a document from the order detail page. Verify the document type dropdown appears with options (Receita, Identidade, Laudo Médico, Comprovante de Endereço, Nota Fiscal, Autorização ANVISA, Outro/Geral). Select a type and upload — verify the document is tagged with the selected type.
- [ ] **Document type display**: Navigate to Documentos page. Verify uploaded documents show the correct type badge (not "Geral" when a specific type was selected).

### 5.4b Controle (Order List & Filters)

- [ ] **Controle list**: Navigate to /controle. Verify the order list loads with date-range filters (default: last 30 days).
- [ ] **Pagination**: Verify the entries-per-page dropdown defaults to 30. Switch to 50, 100. Select "All" — verify a warning dialog appears asking "are you sure?".
- [ ] **Date filters**: Change start/end date range. Verify only orders within the selected range appear.
- [ ] **Status filter**: Filter by order status. Verify correct orders appear.
- [ ] **CSV bulk import** (admin only): Import a CSV file. Verify column mapping dialog appears, validation runs, and orders are created in chunks. Verify duplicate detection via `batchImportId`.
- [ ] **Mark as Paid**: Click "Mark as Paid" on an unpaid order. Verify status changes to `paid`.
- [ ] **Mark as Signed**: Click "Mark as Signed" for a Comprovante de Vinculo document. Verify `zapsignCvStatus` updates.
- [ ] **ANVISA link**: Verify "Iniciar ANVISA" is enabled only when payment is confirmed AND ZapSign is signed (if applicable). Click — verify it opens ANVISA Solicitacao with the order pre-selected.
- [ ] **ANVISA upload**: Upload an ANVISA Autorizacao document. Verify `anvisaStatus` changes to CONCLUIDO.
- [ ] **Document upload**: Upload remaining required documents. Verify per-document status tracking (pending → received).

### 5.5 ANVISA Workflow

- [ ] **Order picker**: Navigate to Nova Solicitacao. Verify only eligible orders appear (has prescription, paid, ZapSign signed if applicable, no existing ANVISA request).
- [ ] **Prescription pre-loading**: Select an order. Verify prescription data is imported without re-upload.
- [ ] **Document upload**: Upload a patient ID image. Verify AI classifies and extracts OCR data.
- [ ] **Modelo Solicitante**: Navigate to /anvisa/perfil. Verify all fields are present: Nome, Email, RG, Sexo/Genero, Data de Nascimento, Endereco, CEP, Estado, Municipio, Celular, Telefone Fixo. Fill and save. Verify data persists on reload.
- [ ] **Modelo Solicitante in payload**: Send data to extension. Verify the popup shows all requester fields (Nome, Email, RG, Sexo, DOB, Estado, Municipio, etc.) separately from patient fields.
- [ ] **CEP-to-state derivation**: Submit a patient with CEP but no state (e.g., 35400-012). Verify patientState auto-populates as "MG" in the validation form.
- [ ] **Chrome extension (v1.3.5)**: Click "Enviar para extensao". Open the ANVISA portal. Verify the extension auto-fills form fields. Verify solicitante section fills from profile data (not patient OCR data). Verify patient section fills from OCR data.

### 5.6 Estoque (Inventory)

- [ ] **Miami tab**: Shows products with quantities for the Miami (Tristar) stock location.
- [ ] **Brasil tab**: Shows products with quantities for the Brasil stock location.
- [ ] **Inline editing**: Click a quantity, change it, save. Verify Firestore is updated.
- [ ] **Auto-create prompt**: If a stock location doesn't exist, verify the "create" prompt appears.

### 5.7 Dashboard

- [ ] **Build number**: Verify the dashboard shows a build version (git SHA + date) so users know which deployment is running.
- [ ] **Overview metrics**: Verify sales summary, active users count, and quick-access links are displayed.

### 5.8 Documents

- [ ] **Document list**: Navigate to /documentos. Verify documents are listed with columns: Tipo, Pedido, Medico, Enviado por, Data.
- [ ] **Date filter**: Filter by date range. Verify only documents within the range appear.
- [ ] **Type filter**: Filter by document type. Verify correct documents appear.
- [ ] **User scoping**: As a non-admin user, verify only your own uploaded documents appear. As admin, verify all documents appear.

### 5.9 Access Control

- [ ] **Domain restriction**: Attempt login with a non-`@entouragelab.com` Google account. Verify immediate sign-out.
- [ ] **Admin-only operations**: Log in as a non-admin user. Verify delete buttons, user management, and CSV import are hidden/disabled.
- [ ] **Pre-registration**: Create a pre-registration record. Log in with that email for the first time. Verify the assigned role is applied.

### 5.10 Deployment

- [ ] **Auto-deploy**: Push to `main` branch. Verify Firebase App Hosting triggers a new rollout within 5 minutes.
- [ ] **Manual deploy**: Run `firebase apphosting:rollouts:create vend-backend --git-branch main`. Verify rollout succeeds.
- [ ] **Favicon**: Verify browser tab shows the custom favicon.ico.

---

## 6. Test Execution Log

```
$ npm test

 ✓ src/server/integrations/webhooks.test.ts    (19 tests)   3ms
 ✓ src/server/integrations/bcb-ptax.test.ts    (12 tests)  21ms
 ✓ src/server/integrations/globalpay.test.ts   (17 tests)  24ms
 ✓ src/server/integrations/zapsign.test.ts     (26 tests)  60ms
 ✓ src/lib/order-status-helpers.test.ts        (39 tests)   4ms

 Test Files  5 passed (5)
      Tests  113 passed (113)
   Duration  300ms
```

**TypeScript check:** `npx tsc --noEmit` — 0 errors.

---

## 7. Risk Matrix

| Module | Automated Tests | Risk Level | Notes |
|---|---|---|---|
| Order status logic | 39 tests | **Low** | Fully covered. All combinations tested. |
| BCB PTAX rates | 12 tests | **Low** | Cache, retry, and error paths covered. |
| GlobalPay integration | 17 tests | **Low** | Auth, caching, retry, error mapping covered. |
| ZapSign integration | 26 tests | **Low** | Markdown, API, sandbox, errors covered. |
| Webhook handlers | 19 tests | **Low** | Parsing, idempotency, status logic covered. |
| Firestore services | 0 tests | **Medium** | Atomic batch writes not tested. Recommend Firebase Emulator tests. |
| React components | 0 tests | **Low** | Thin UI wrappers. Low defect probability. |
| Chrome extension | 0 tests | **High** | Dependent on ANVISA portal DOM. Highest regression risk. |
| AI/OCR pipeline | 0 tests | **Medium** | Dependent on image quality and model accuracy. |
| E2E flows | 0 tests | **Medium** | Integration between modules not automatically verified. |

---

*This document should be reviewed and updated whenever new modules are added or existing test coverage changes.*
