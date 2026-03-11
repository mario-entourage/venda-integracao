# Entourage Lab — Sales Integration Platform

> Comprehensive requirements document for developer handoff.
> Last updated: 2026-03-10

---

## Table of Contents

1. [Goal](#1-goal)
2. [Purpose and Philosophy](#2-purpose-and-philosophy)
3. [Stakeholders](#3-stakeholders)
4. [Requirements](#4-requirements)
5. [Database](#5-database)
6. [Risks](#6-risks)
7. [Constraints](#7-constraints)
8. [Future](#8-future)

---

## 1. Goal

Entourage Lab is a Brazilian pharmaceutical company that imports cannabis-based medicinal products (CBD, THC) from the United States for sale in Brazil. Every sale requires regulatory authorization from ANVISA (Brazil's FDA equivalent), legal documentation, and international shipping logistics.

**This platform is the internal operations system that manages the entire sale lifecycle** — from the moment a sales representative takes an order through payment processing, regulatory compliance, document signing, and final delivery to the patient.

### What the platform does

1. **Creates sales orders** via a guided 5-step wizard (select patient/doctor/products, configure shipping, generate payment link, create e-signature documents, send everything to the client).
2. **Tracks order progress** through a multi-condition checklist: payment confirmation, document signing, ANVISA authorization, document completeness, and shipping.
3. **Automates ANVISA submissions** by extracting data from uploaded documents via AI (Google Gemini OCR) and auto-filling the ANVISA government portal via a Chrome browser extension.
4. **Manages inventory** across two physical locations: Miami (USA, via TriStar Express warehouse) and Brazil (local).
5. **Processes payments** through GlobalPay, a cross-border payment gateway that handles USD-to-BRL conversion.
6. **Handles shipping** through three methods: TriStar Express (international from Miami), Correios/Sedex (domestic Brazil), and motoboy (local delivery).

### What success looks like

An operator can process a sale from start to delivery without leaving the platform. The system handles payment links, e-signatures, exchange rates, regulatory filings, and shipping labels. Manual data entry between systems is eliminated.

---

## 2. Purpose and Philosophy

### Why this platform exists

Before this platform, operators managed sales across spreadsheets, WhatsApp, email, and multiple government websites. Each sale required manually copying patient data between 4-5 systems, manually calculating exchange rates, and manually filling ANVISA forms field by field. A single sale could take 2-3 hours of operator time.

This platform consolidates all of those workflows into one system.

### Design philosophy

| Principle | Rationale |
|---|---|
| **Single source of truth** | Every piece of order data lives in one Firestore document tree. No data is duplicated across spreadsheets or external systems. |
| **Wizard-driven creation, checklist-driven tracking** | Creation is synchronous (5 wizard steps in one session). Tracking is asynchronous (operator monitors a checklist that updates as the client pays, signs, etc.). |
| **Fail gracefully, never lose data** | Non-critical operations (ZapSign creation, prescription upload) are non-fatal. If they fail, the order is still created and the operator can retry from the detail page. |
| **Soft deletes everywhere** | No data is ever physically deleted. Records are flagged as inactive/deleted, preserving full audit trails for regulatory compliance. |
| **Atomic writes for consistency** | The entire order (root document + 8 subcollections) is created in a single Firestore batch write. It either all succeeds or all fails. |
| **Portuguese-first UI** | All labels, messages, and user-facing text are in Brazilian Portuguese. The codebase (variable names, comments) is in English. |
| **Domain-locked access** | Only `@entouragelab.com` Google accounts can access the platform. This is enforced at both the Firebase Auth level and in Firestore security rules. |

### Architecture overview

- **Frontend**: Next.js 15 (App Router) with React 19, TypeScript, Tailwind CSS, shadcn/ui components
- **Backend**: Firebase ecosystem — Firestore (database), Firebase Auth (authentication), Firebase Storage (file uploads), Firebase App Hosting (deployment), Cloud Functions (OCR pipeline)
- **AI**: Google Genkit with Gemini 2.5 Flash/Pro for document classification and OCR extraction
- **Integrations**: GlobalPay (payments), ZapSign (e-signatures), TriStar Express (shipping), BCB PTAX (exchange rates)
- **Browser extension**: Chrome Manifest V3 extension for ANVISA portal auto-fill

---

## 3. Stakeholders

### Users

| Role | Access level | Description |
|---|---|---|
| **Admin** | Full access | Can create/edit/delete all records, manage users, perform batch operations, access all modules. Currently: `caio@entouragelab.com`, `mario@entouragelab.com` (hardcoded super-admins), plus dynamic admins via `roles_admin` collection. |
| **User (Operator)** | Standard access | Can create sales, manage orders, process ANVISA requests, manage clients/doctors. Cannot delete records or manage other users. |
| **View Only** | Read-only access | Can view orders and data but cannot create or modify records. |

### External parties

| Party | Interaction |
|---|---|
| **Patients (clients)** | Receive payment links and e-signature requests via WhatsApp. Access the customer-facing checkout page (`/checkout/{orderId}`) to complete payment. Never log into the platform. |
| **Doctors** | Their prescription and CRM data are stored in the system. They never interact with the platform directly. |
| **Sales representatives** | Have platform accounts with `isRepresentante: true` in the `users` collection. Their name and user ID are recorded on each order. |
| **ANVISA** | Government regulatory body. Operators submit import authorization requests through the ANVISA gov.br portal. The Chrome extension auto-fills the portal form. |
| **GlobalPay** | Payment gateway. Sends webhook notifications when payments are completed. |
| **ZapSign** | E-signature provider. Sends webhook notifications when documents are signed. |
| **TriStar Express** | Shipping partner in Miami. API used to create shipments and generate labels. |
| **BCB (Central Bank of Brazil)** | Public API provides daily PTAX exchange rates for USD/BRL conversion. |

### Pre-registration system

Admins can pre-register users before their first login via the `preregistrations` collection. When a pre-registered user signs in with Google OAuth for the first time, their role is automatically assigned based on the pre-registration record. Document ID = email with `@` and `.` replaced by `_`.

---

## 4. Requirements

### Order Lifecycle

The platform follows a two-phase order lifecycle:

**Phase 1 — Operator Setup (Nova Venda Wizard)**

```
Step 0  Identification    Select client, doctor, representative, products.
                          Upload prescription (drag-and-drop with green/red
                          visual feedback). Fetch PTAX exchange rate.
                          Representative is selected from users with
                          isRepresentante flag.
Step 1  Shipping          Set frete (shipping cost). Select shipping method
                          (TriStar, Correios, Motoboy, Other). Enter
                          shipping address and carrier details.
Step 2  Payment           Create GlobalPay payment link. Invoice number
                          auto-generated in ETGANS##### format.
                          Configure allowed payment methods.
Step 3  Documents         Create ZapSign e-signature documents if needed
                          (Comprovante de Vinculo and/or Procuracao).
                          Enter Signatario details (name + CPF).
Step 4  Send to Client    Review summary. Copy/share payment + signing links
                          via WhatsApp. Order created atomically.
```

**Phase 2 — Async Resolution (Checklist Tracking)**

The operator monitors the order in the Pedidos module. A checklist tracks:

```
[x] Prescription uploaded
[x] Payment link sent         -> waiting for client to pay
[ ] Comprovante de Vinculo     -> waiting for client to sign (if applicable)
[ ] Procuracao                 -> waiting for client to sign (if applicable)
[ ] ANVISA Solicitacao         -> blocked until payment + ZapSign complete
[ ] ANVISA Autorizacao         -> created after ANVISA submission
[ ] Documents complete         -> upload Autorizacao + remaining docs
[ ] Shipped                    -> create shipment via TriStar/Correios/Motoboy
```

**Ready-to-Ship Predicate**: An order is "ready to ship" when ALL of these conditions are met:
- Status is `paid`
- `documentsComplete` is `true`
- ANVISA is either `exempt` OR `anvisaStatus === 'CONCLUIDO'`
- All ZapSign documents are `signed` (if any were created)

When an order is ready to ship, the UI highlights it with an emerald accent and shows shipping action buttons (TriStar, Correios, Motoboy). Before that point, pre-shipping actions are shown instead (mark paid, upload docs, ANVISA, ZapSign).

---

### Functional Requirements

#### FR-01 Nova Venda (New Sale Wizard)

| ID | Requirement |
|---|---|
| FR-01.1 | A 5-step wizard guides the operator through order setup: Identification, Shipping, Payment, Documents, Send to Client. The wizard is completed in a single session. |
| FR-01.2 | **Step 0 — Identification**: Select or create a client (patient), doctor, representative. Representatives are selected from users with `isRepresentante` flag (not the legacy `representantes` collection). Add products with negotiated BRL pricing via a searchable dropdown that shows full product names. Upload a prescription image via drag-and-drop. When dragging a file, the Receita drop zone highlights green with "Solte a receita aqui!" text, while the Produtos area shows a bold red overlay with repeated "NÃO!" text to prevent misplacement. |
| FR-01.2a | **Duplicate prescription detection**: The system computes a SHA-256 hash of each uploaded prescription and checks it against active orders. If a match is found, the wizard blocks advancement and shows the conflicting order ID. The user must cancel the existing order to reuse the prescription. Admins can override this check via a checkbox ("Permitir receita duplicada") to proceed without canceling. |
| FR-01.3 | The system fetches the current PTAX exchange rate (BCB) and stores it with the order for USD/BRL conversion. |
| FR-01.4 | **Step 1 — Shipping**: Set frete (shipping cost), select shipping method (TriStar, Correios, Motoboy, Other), enter shipping address and carrier details. |
| FR-01.5 | **Step 2 — Payment**: A payment link is generated via GlobalPay. An invoice number in `ETGANS#####` format (e.g., `ETGAMB00042`) is auto-generated from the rep's initials + an atomic counter. Configures allowed payment methods (credit card, debit card, boleto, PIX). |
| FR-01.6 | **Step 3 — Documents**: The user indicates whether a Comprovante de Vinculo or Procuracao is needed. If yes, the user enters Signatario details (name + CPF) and the system creates ZapSign document(s). |
| FR-01.7 | **Step 4 — Send to Client**: Displays a summary of everything created (payment link, ZapSign links if any). Provides copy/share buttons (including WhatsApp deep link) to send all links to the client. |
| FR-01.8 | The order, all subcollections, and the prescription record are created atomically in a single Firestore batch write. The order and prescription share the same document ID (Receita ID). |
| FR-01.9 | Resume mode: An incomplete order can be resumed via `?resume={orderId}` URL parameter. This renders a simplified wizard that picks up where the operator left off. |

#### FR-02 Pedidos (Consolidated Order Tracker)

| ID | Requirement |
|---|---|
| FR-02.1 | Display a filterable list of all in-progress orders. Filter options: "Todos em andamento" (all), "Pronto p/ envio" (ready to ship), and individual status values. |
| FR-02.2 | Each order row shows: the invoice number (e.g., `ETGAMB00042`) or short order ID, representative name, and a granular status badge computed from checklist state (e.g., "Falta Pagamento + Documentos", "Pronto para Envio"). Missing items are shown as colored pills. |
| FR-02.3 | Orders that satisfy `isReadyToShip()` are visually highlighted with an emerald accent ring/background. |
| FR-02.4 | **Pre-ship actions** (shown when order is NOT ready to ship): Mark as Paid, upload Documents, trigger ANVISA, open ZapSign signing URLs. |
| FR-02.5 | **Shipping actions** (shown when order IS ready to ship): Create TriStar shipment, create Correios (Sedex/PAC) shipment, assign Motoboy delivery. |
| FR-02.6 | Admin batch operations: select-all checkbox, batch soft-delete with confirmation dialog. |
| FR-02.7 | Per-order actions via dropdown menu: view detail, regenerate payment link, open signing URLs, cancel order, soft-delete. |
| FR-02.8 | ANVISA status is shown as missing ("Falta ANVISA") unless `anvisaOption === 'exempt'` OR `anvisaStatus === 'CONCLUIDO'`. |

#### FR-03 Controle (Order Detail & Checklist)

| ID | Requirement |
|---|---|
| FR-03.1 | Order detail page displays the full order checklist with real-time status for each item. Each incomplete item links to its resolution action. |
| FR-03.2 | "Mark as Signed" button for Comprovante de Vinculo documents. |
| FR-03.3 | Manual "Mark as Paid" action for advancing order status when payment is confirmed outside the webhook flow. |
| FR-03.4 | "Iniciar ANVISA" action is enabled only when payment is confirmed AND ZapSign is signed (if applicable). Links to ANVISA Solicitacao with the order pre-selected. |
| FR-03.5 | Upload area for ANVISA Autorizacao document. Marks `anvisaStatus` as CONCLUIDO when uploaded. |
| FR-03.6 | Upload area for remaining required documents (patient ID, proof of residence). A document type selector allows choosing the type (prescription, identity, medical report, proof of address, invoice, ANVISA authorization, general) before uploading. Tracks per-document status (pending, received, approved, rejected). |
| FR-03.6a | Representative selector on the order detail page allows assigning/changing the sales rep from users with `isRepresentante` flag. |
| FR-03.7 | CSV bulk import (admin-only): column mapping, validation, duplicate detection via `batchImportId`, batch creation in chunks of 80 rows (within Firestore's 500-operation batch limit). |
| FR-03.8 | Date-range filtering for order lists. |

#### FR-04 ANVISA Solicitations

| ID | Requirement |
|---|---|
| FR-04.1 | **Order Picker**: Nova Solicitacao displays eligible orders — orders with a prescription, payment confirmed, ZapSign signed (if applicable), and no linked ANVISA request. |
| FR-04.2 | **Prescription pre-loading**: After selecting an order, the prescription file and extracted client/doctor data are imported from the order. No re-upload needed. |
| FR-04.3 | **Document upload**: User uploads remaining documents (patient ID, proof of residence). AI classifies and extracts OCR data via Gemini. |
| FR-04.4 | Status tracking: PENDENTE, EM_AJUSTE, EM_AUTOMACAO, CONCLUIDO, ERRO. |
| FR-04.5 | AI suggests field corrections when extracted data is incomplete or inconsistent. |
| FR-04.6 | Bidirectional linking: ANVISA request stores `orderId`; order stores `anvisaRequestId`. |
| FR-04.7 | Modelo Solicitante: user profile for ANVISA requester details (name, email, RG, address, CEP, phone, landline). Autofills the solicitation form. |
| FR-04.8 | Chrome extension (v1.3.0) receives OCR data via `window.postMessage` and auto-fills the ANVISA gov.br portal form. Handles text fields, native selects, DS Gov selects (`br-select`), react-select dropdowns, cascading state/city dropdowns, and file uploads. |
| FR-04.9 | Validation warns when Modelo Solicitante is not configured. |

#### FR-05 Clients / Doctors / Representatives

| ID | Requirement |
|---|---|
| FR-05.1 | CRUD operations for clients (patients) and doctors. Sales representatives are managed as users with `isRepresentante: true` in the `users` collection (merged from the legacy `representantes` collection). |
| FR-05.2 | Search by name with active-only filtering. |
| FR-05.3 | Representative selectors throughout the app query users with `isRepresentante == true` and `active == true`, ordered by `displayName`. |
| FR-05.4 | Client address stored for document generation (Comprovante de Vinculo). |
| FR-05.5 | Client records include: CPF, RG, name, email, phone, birth date, full address. |
| FR-05.6 | Doctor records include: CRM number, specialty, state, city, contact info. |

#### FR-06 Products & Inventory

| ID | Requirement |
|---|---|
| FR-06.1 | Product catalog with: name, SKU, HS code (customs), concentration, USD price. |
| FR-06.2 | Two named stock locations: Miami (Tristar) and Brasil. Each has independent product quantities. |
| FR-06.3 | Inventory is managed via a many-to-many junction (`stockProducts`): each product can exist at multiple locations with different quantities. |
| FR-06.4 | Inline quantity editing per location (click quantity, edit, save). |
| FR-06.5 | Products not yet assigned to a location show a dash and an "Add" button. |
| FR-06.6 | Estoque module has 4 tabs: Miami (Tristar), Brasil, Catalogo (product CRUD), Locais de Estoque (location management). |

#### FR-07 Shipping

| ID | Requirement |
|---|---|
| FR-07.1 | **TriStar Express**: Create shipments via API with recipient address, items (type, quantity, value, ANVISA authorization number, product name). |
| FR-07.2 | TriStar item types: Produtos (10), Livros (20), Medicamento (30), CBD (40), THC (41), Outro (90). |
| FR-07.3 | Track shipment status and retrieve tracking codes. |
| FR-07.4 | Generate and download shipping labels. |
| FR-07.5 | **Correios (local mail)**: Manual entry of tracking code, carrier (Sedex/PAC), and shipping date. |
| FR-07.6 | **Motoboy**: Manual entry of delivery person name, phone, and estimated delivery date. |
| FR-07.7 | After shipping is confirmed, the order row is immediately hidden from the active list (local `shippedIds` state for instant UX feedback before Firestore updates propagate). |

#### FR-08 Users & Access Control

| ID | Requirement |
|---|---|
| FR-08.1 | Google OAuth authentication restricted to `@entouragelab.com` domain. Account picker always shown; domain enforced both client-side (sign out non-matching) and in Firestore rules. |
| FR-08.2 | Three roles: admin (full access), user (standard operations), view_only (read-only). |
| FR-08.3 | Super-admins: `caio@entouragelab.com` and `mario@entouragelab.com` (hardcoded). Dynamic admins via `roles_admin` collection. |
| FR-08.4 | Pre-registration: admins assign roles before a user's first login via `preregistrations` collection. |
| FR-08.5 | User management UI for admins to create, edit, and deactivate accounts. |

#### FR-09 Checkout (Customer-Facing)

| ID | Requirement |
|---|---|
| FR-09.1 | Customer-facing payment page at `/checkout/{orderId}`. Shows order summary, products, total amount. |
| FR-09.2 | Payment confirmation page displayed after successful payment. |
| FR-09.3 | WhatsApp share button to send payment link to client. |
| FR-09.4 | QR code generation for payment link sharing. |

#### FR-10 Dashboard

| ID | Requirement |
|---|---|
| FR-10.1 | Dashboard page at `/dashboard` with overview metrics. |
| FR-10.2 | Entry point after login. |

#### FR-11 Help & Documentation

| ID | Requirement |
|---|---|
| FR-11.1 | In-app help page (`/ajuda`) with web application guide and Chrome extension guide. |
| FR-11.2 | Extension download link and GitHub source available from `/anvisa/extensao`. |

---

### Nonfunctional Requirements

#### NFR-01 Performance

| ID | Requirement |
|---|---|
| NFR-01.1 | Order list pages load within 2 seconds on standard broadband. |
| NFR-01.2 | PTAX exchange rate cached for 30 minutes to reduce BCB API calls. |
| NFR-01.3 | GlobalPay JWT tokens cached with 60-second refresh buffer. |
| NFR-01.4 | Real-time Firestore listeners (via `useCollection` hook) for all order-related pages. No polling. |
| NFR-01.5 | ANVISA pre-loads prescription data from the linked order without re-uploading or re-processing. |

#### NFR-02 Reliability

| ID | Requirement |
|---|---|
| NFR-02.1 | Order creation is atomic — all subcollections commit or none do. |
| NFR-02.2 | Non-critical operations (ZapSign creation, prescription upload) are non-fatal: failures are logged but do not block order creation. |
| NFR-02.3 | Webhook handlers (GlobalPay, ZapSign) are idempotent — replayed events do not corrupt state. |
| NFR-02.4 | PTAX rate lookup retries up to 7 previous days for weekends/holidays. |
| NFR-02.5 | GlobalPay auto-retries once on 401 (clears token cache and re-authenticates). |

#### NFR-03 Security

| ID | Requirement |
|---|---|
| NFR-03.1 | All Firestore operations require Firebase Authentication. |
| NFR-03.2 | Domain restriction: only `@entouragelab.com` users can access the app. Enforced by `onAuthStateChanged` listener; non-matching accounts are signed out immediately. |
| NFR-03.3 | Delete operations restricted to admin role in Firestore security rules. |
| NFR-03.4 | Sensitive API keys stored as Firebase App Hosting secrets, never in client code. Secrets: `GOOGLE_API_KEY`, `GLOBALPAY_API_URL`, `GLOBALPAY_PUB_KEY`, `ZAPSIGN_API_KEY`, `TRISTAR_API_KEY`. |
| NFR-03.5 | ANVISA requests: owner-or-admin access control. Users can only read/update their own requests unless they are admins. |
| NFR-03.6 | Super-admin status checked via hardcoded email list in both client code and Firestore rules. |

#### NFR-04 Scalability

| ID | Requirement |
|---|---|
| NFR-04.1 | Firestore composite indexes support all query patterns without full-collection scans. 9 composite indexes currently defined (including `users` indexes for rep queries and group queries). |
| NFR-04.2 | CSV import processes orders in batches of 80 to stay within Firestore's 500-operation batch limit. |
| NFR-04.3 | Firebase App Hosting with auto-scaling: 0-4 instances, 1 CPU, 512 MiB memory, 100 concurrency per instance. |

#### NFR-05 Auditability

| ID | Requirement |
|---|---|
| NFR-05.1 | Every document tracks `createdAt`, `updatedAt`, `createdById`, `updatedById`. |
| NFR-05.2 | Soft deletes preserve historical records. Active flags: `active` (products, clients, doctors, reps, users) and `softDeleted` (orders, ANVISA requests). |
| NFR-05.3 | Deleted ANVISA requests are archived to `anvisa_deleted_requests` (write-protected collection). |

#### NFR-06 Usability

| ID | Requirement |
|---|---|
| NFR-06.1 | All UI labels in Brazilian Portuguese. |
| NFR-06.2 | Responsive layout for desktop and tablet. |
| NFR-06.3 | Loading skeletons for all async data fetches. |
| NFR-06.4 | Inline error messages with toast notifications. |
| NFR-06.5 | Tooltip helpers on action buttons with `delayDuration={300}`. |

#### NFR-07 Brand & Visual Identity

| ID | Requirement |
|---|---|
| NFR-07.1 | Brand name displayed as "ENTOURAGE" with the Greek lambda character for A where applicable. |
| NFR-07.2 | Headings: Montserrat font, uppercase via `font-headline` + `text-transform: uppercase`. |
| NFR-07.3 | Body text: Inter font family. |
| NFR-07.4 | Background: Whispering Mist `RGB(234, 234, 234)`. Primary accent: Traditional Turquoise `RGB(3, 145, 163)`. Secondary: Teal Blue `RGB(9, 61, 91)`. |
| NFR-07.5 | Dark sidebar with Teal Blue background and white icon/text. |
| NFR-07.6 | Four brand icon variants: color, white (255), light gray (234), black (000). |

---

### Integrations

#### INT-01 GlobalPay — Payment Processing

| Attribute | Value |
|---|---|
| **Purpose** | Generate payment links for customer orders and process payment notifications via webhooks. |
| **Base URL** | `https://api.tryglobalpays.com/v1` (configurable via `GLOBALPAY_API_URL` secret) |
| **Authentication** | Bearer JWT from `POST /paymentapi/auth` using merchant pub key + merchant code. Token cached with 60-second refresh buffer. Auto-retry on 401. |
| **Endpoints** | `POST /paymentapi/auth` — obtain JWT |
| | `POST /paymentapi/order` — create payment link |
| | `GET /paymentapi/order/{gpOrderId}` — query transaction status |
| | `POST /paymentapi/order/{gpOrderId}/cancel` — cancel transaction |
| **Success code** | `statusCode === 1` (not HTTP 200 — this is a GlobalPay-specific convention) |
| **Error handling** | 40+ error codes mapped to Portuguese messages in the codebase |
| **Webhook** | `POST /api/webhooks/payment` — receives payment events. Parses `invoice` (= `ETGANS#####` format invoice number), `gpOrderId`, `status`, `amount`. Looks up the order by querying `orders` where `invoice == body.invoice`, with fallback to `referenceId` for legacy links. Approved statuses: `approved`, `paid`, `completed`, `success`. Creates payment audit record, updates order status to `paid` (idempotent). |
| **Env vars** | `GLOBALPAY_API_URL` (secret), `GLOBALPAY_PUB_KEY` (secret), `GLOBALPAYS_MERCHANT_CODE` (plain: `4912`) |

#### INT-02 ZapSign — Electronic Document Signing

| Attribute | Value |
|---|---|
| **Purpose** | Generate and track e-signatures for Comprovante de Vinculo and Procuracao documents. Created during Nova Venda Step 2. |
| **Base URL** | `https://api.zapsign.com.br` (configurable via `ZAPSIGN_API_URL`) |
| **Authentication** | Bearer API key in `Authorization` header. |
| **Endpoint** | `POST /api/v1/docs/` — create document with signer from markdown template. |
| **Document types** | **Comprovante de Vinculo**: Signatario (name + CPF) declares that Cliente (name + CPF) resides at a given address. **Procuracao**: power of attorney document (when applicable). |
| **Webhook** | `POST /api/webhooks/zapsign` — receives `doc_signed` events. Identifies Procuracao vs Comprovante by token match. Updates `zapsignStatus` or `zapsignCvStatus` to `signed`. Correlates via `external_id` = orderId. Idempotent. |
| **Env vars** | `ZAPSIGN_API_URL` (plain), `ZAPSIGN_API_KEY` (secret), `ZAPSIGN_SANDBOX` (plain: `false`) |

#### INT-03 BCB PTAX — Exchange Rates

| Attribute | Value |
|---|---|
| **Purpose** | Fetch daily USD/BRL reference exchange rates from the Central Bank of Brazil for order pricing. |
| **Base URL** | `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` |
| **Authentication** | None (public OData API). |
| **Endpoint** | `GET CotacaoDolarDia(dataCotacao=@dataCotacao)` — daily dollar quote. |
| **Caching** | 30-minute TTL for "today" lookups. Historical lookups bypass cache. |
| **Retry** | Walks back up to 7 days if rate unavailable (weekends/holidays). |
| **Returns** | `PtaxQuote` with `buyRate`, `sellRate`, `midRate` (calculated average), `quotedAt`, `queryDate`. |
| **Env vars** | None required. |

#### INT-04 TriStar Express — Shipping & Logistics

| Attribute | Value |
|---|---|
| **Purpose** | Create shipments from Miami warehouse, generate labels, and track delivery. |
| **Base URL** | `https://sandbox.tristarexpress.com/v1/` (configurable via `TRISTAR_API_URL`). **NOTE: Currently configured for sandbox.** |
| **Authentication** | Bearer API key. |
| **Endpoints** | `POST /shipments` — create shipment |
| | `GET /tracking/{shipmentId}` — track status |
| | `POST /shipments/{shipmentId}/label` — generate label |
| | `POST /shipments/{shipmentId}/confirm` — confirm dispatch |
| **Env vars** | `TRISTAR_API_URL` (plain), `TRISTAR_API_KEY` (secret) |

#### INT-05 Google Gemini — AI Document Processing

| Attribute | Value |
|---|---|
| **Purpose** | Classify uploaded documents and extract structured data via OCR. Used in ANVISA workflow for patient ID, proof of residence, and prescription processing. |
| **SDK** | `@genkit-ai/google-genai` (Google Genkit framework) |
| **Model** | `googleai/gemini-2.5-flash` (classification, extraction), `googleai/gemini-2.5-pro` (complex extraction) |
| **Capabilities** | Document classification (4 types: patient ID, proof of residence, procuracao, prescription), OCR field extraction with typed JSON schemas, confidence scoring, correction suggestions. |
| **Cloud Function** | `anvisaProcessDocumentOnUpload` — triggered on Firebase Storage upload. Preprocesses images (rotation, grayscale, contrast normalization, blur+sharpen, 1.5x upscale), runs OCR via Google Vision API, extracts structured fields. Region: us-central1, 300s timeout, 1GB memory. |
| **Env vars** | `GOOGLE_API_KEY` (secret) |

#### INT-06 Firebase — Backend Infrastructure

| Attribute | Value |
|---|---|
| **Services** | Authentication (Google OAuth), Firestore (database), Storage (file uploads), App Hosting (deployment), Cloud Functions (OCR pipeline). |
| **Runtime** | Node.js 20 for Cloud Functions. |
| **Deployment** | Firebase App Hosting with GitHub-triggered auto-deploy from `main` branch. Manual trigger: `firebase apphosting:rollouts:create vend-backend --git-branch main`. |
| **Security rules** | Domain-restricted reads/writes. Admin-only deletes. Subcollection access follows parent order permissions. Super-admin defined by email check. |
| **Env vars** | `NEXT_PUBLIC_FIREBASE_API_KEY` (plain), plus 5 other `NEXT_PUBLIC_FIREBASE_*` client config vars. |

#### INT-07 ANVISA Auto-Fill Chrome Extension

| Attribute | Value |
|---|---|
| **Purpose** | Auto-fill the ANVISA import authorization portal form (gov.br) with OCR-extracted data from the web app. |
| **Version** | v1.3.0 |
| **Communication** | `window.postMessage` from web app to content script. |
| **Capabilities** | Text input fields (25+), native HTML selects, DS Gov `br-select` components, react-select dropdowns, cascading state/city dropdowns with async loading, file uploads (RG, comprovante, receita, procuracao). |
| **Distribution** | Manual `.zip` download from `/extensao-anvisa.zip`. Install via Chrome Developer Mode ("Load unpacked"). |
| **Source** | `https://github.com/mario-entourage/Anvisa_app/tree/main/extension` |
| **Limitation** | Cannot handle CAPTCHA or bot detection on gov.br. The extension currently covers approximately 75% of form fields. Dropdown and file upload support was added in v1.3.0 but may need ongoing maintenance as the gov.br portal changes its DOM structure. |

---

## 5. Database

### Technology

Google Cloud Firestore — a serverless, horizontally-scaled NoSQL document database. Data is organized into collections of documents, with support for nested subcollections.

### Design Principles

| Principle | Implementation |
|---|---|
| **Single primary key** | Every order and its prescription share the same Firestore document ID (the Receita ID). One key identifies the order across every collection and subcollection. |
| **Denormalized subcollections** | Order-scoped data (customer, doctor, products, payments) lives in subcollections under the order document. This is the canonical Firestore pattern — fast reads, atomic writes, simple security rules. |
| **Atomic batch writes** | The entire order tree (root + 8 subcollections) is created in a single `writeBatch` commit. All-or-nothing. |
| **Soft deletes** | Records use `active` / `softDeleted` flags rather than physical deletion. Preserves audit trails for regulatory compliance. |
| **Timestamp bookkeeping** | Every document: `createdAt`, `updatedAt` (server timestamps). Many also track `createdById`, `updatedById` (auth UIDs). |
| **Composite indexes** | All list views that filter + sort have declared composite indexes, keeping queries O(log n). |
| **Namespace separation** | ANVISA collections prefixed with `anvisa_` to avoid collisions with sales module. |

### Collections

#### `orders/{receitaId}` — Central collection

Each document represents one sales order. Document ID = Receita ID = prescription ID.

| Field | Type | Description |
|---|---|---|
| `status` | OrderStatus | pending, processing, awaiting_documents, documents_complete, awaiting_payment, paid, shipped, delivered, cancelled |
| `type` | OrderType | sale, return, exchange |
| `invoice` | string | Invoice / payment reference number |
| `currency` | string | BRL or USD |
| `amount` | number | Total order value |
| `discount` | number | Discount percentage |
| `exchangeRate` | number? | PTAX midpoint rate at order creation |
| `exchangeRateDate` | string? | Date rate was quoted (YYYY-MM-DD) |
| `legalGuardian` | boolean | Whether order is placed by a legal guardian |
| `anvisaOption` | AnvisaOption? | regular, exceptional, exempt |
| `anvisaStatus` | string? | ANVISA request status |
| `anvisaRequestId` | string? | FK to `anvisa_requests` |
| `zapsignDocId` | string? | ZapSign Procuracao document token |
| `zapsignStatus` | string? | Procuracao signing status |
| `zapsignSignUrl` | string? | Procuracao signing URL |
| `zapsignCvDocId` | string? | ZapSign Comprovante de Vinculo token |
| `zapsignCvStatus` | string? | Comprovante signing status |
| `zapsignCvSignUrl` | string? | Comprovante signing URL |
| `allowedPaymentMethods` | object? | `{ creditCard, debitCard, boleto, pix }` boolean flags |
| `frete` | number? | Shipping cost (BRL) |
| `documentsComplete` | boolean | All required documents received |
| `prescriptionDocId` | string? | Firebase Storage path to prescription |
| `tristarShipmentId` | string? | TriStar shipment reference |
| `softDeleted` | boolean? | Soft-delete flag |
| `createdById` | string | Auth UID of creator |
| `updatedById` | string? | Auth UID of last updater |
| `createdAt` | Timestamp | Server timestamp |
| `updatedAt` | Timestamp | Server timestamp |
| `batchImportId` | string? | CSV import deduplication key |
| `codigoRastreio` | string? | Tracking code |
| `statusEnvio` | string? | Shipping status |
| `formaEnvio` | string? | Shipping carrier / method |
| `dataEnvio` | string? | Ship date |
| `previsaoEntrega` | string? | Estimated delivery date |
| `lote` | string? | Batch number |
| `lead` | string? | Lead type (first purchase, repurchase) |
| `dataOrcamento` | string? | Quote date |
| `statusOrcamento` | string? | Quote status |
| `meioPagamento` | string? | Payment method used |
| `invoiceCorrecao` | string? | Correction invoice number |

**Subcollections of `orders/{receitaId}`:**

| Subcollection | Cardinality | Contents |
|---|---|---|
| `customer` | 1 doc | Patient name, CPF, linked userId |
| `representative` | 1 doc | Sales rep name, linked userId |
| `doctor` | 1 doc | Doctor name, CRM, linked userId |
| `products` | N docs | Line items: stockProductId, productName, quantity, price, discount |
| `shipping` | 0-1 doc | Address, tracking, carrier info, TriStar fields |
| `documentRequests` | N docs | Required document checklist: type, status, receivedAt |
| `payments` | N docs | Payment records: provider, amount, status |
| `paymentLinks` | N docs | GlobalPay links: URL, amount, expiry, secretKey |

**Indexes:** `(status ASC, createdAt DESC)`, `(createdById ASC, createdAt DESC)`

---

#### `prescriptions/{receitaId}` — 1:1 with orders

Same document ID as the order.

| Field | Type | Description |
|---|---|---|
| `prescriptionDate` | string? | Date from physical prescription |
| `uploadDate` | string | ISO 8601 upload timestamp |
| `clientId` | string | FK to `clients` |
| `doctorId` | string | FK to `doctors` |
| `orderId` | string | Same as document ID |
| `prescriptionPath` | string | Firebase Storage path |
| `products` | array | `{ productId, productName, quantity, negotiatedTotalPrice }` |
| `createdAt` | Timestamp | Server timestamp |

---

#### `clients/{clientId}`

| Field | Type | Description |
|---|---|---|
| `document` | string | CPF or CNPJ |
| `rg` | string? | Identity document number |
| `firstName`, `lastName`, `fullName` | string | Name parts + denormalized full name |
| `email`, `phone` | string? | Contact |
| `birthDate` | Timestamp? | Date of birth |
| `address` | object? | `{ postalCode, street, number, complement, neighborhood, city, state, country }` |
| `active` | boolean | Soft-delete flag |
| `createdAt`, `updatedAt` | Timestamp | Bookkeeping |

**Index:** `(active ASC, fullName ASC)`

---

#### `doctors/{doctorId}`

| Field | Type | Description |
|---|---|---|
| `firstName`, `lastName`, `fullName` | string | Name |
| `crm` | string | Medical license number |
| `mainSpecialty` | string? | Specialty |
| `state`, `city` | string? | Registration location |
| `email`, `phone`, `mobilePhone` | string? | Contact |
| `active` | boolean | Soft-delete flag |
| `createdAt`, `updatedAt` | Timestamp | Bookkeeping |

**Index:** `(active ASC, fullName ASC)`

---

#### `representantes/{representanteId}`

| Field | Type | Description |
|---|---|---|
| `name` | string | Full name |
| `email`, `phone` | string? | Contact |
| `estado` | string? | State (UF) |
| `userId` | string? | Optional FK to `users` |
| `active` | boolean | Soft-delete flag |
| `createdAt`, `updatedAt` | Timestamp | Bookkeeping |

**Index:** `(active ASC, name ASC)`

---

#### `products/{productId}`

| Field | Type | Description |
|---|---|---|
| `name` | string | Product name |
| `description` | string? | Description |
| `sku` | string | Stock keeping unit |
| `hsCode` | string | Harmonized system code (customs) |
| `concentration` | string? | For pharmaceutical products |
| `price` | number | Unit price (USD) |
| `inventory` | number? | Legacy stock count |
| `active` | boolean | Soft-delete flag |
| `createdAt`, `updatedAt` | Timestamp | Bookkeeping |

**Index:** `(active ASC, name ASC)`

---

#### `stocks/{stockId}` and `stockProducts/{stockProductId}`

Many-to-many junction for product-to-location inventory.

- **stocks**: `{ code, name, description, createdAt, updatedAt }`
- **stockProducts**: `{ stockId, productId, quantity, createdAt, updatedAt }`

Two named locations expected: "Miami (Tristar)" and "Brasil".

---

#### `users/{uid}`

Document ID = Firebase Auth UID.

| Field | Type | Description |
|---|---|---|
| `email` | string | Google OAuth email |
| `groupId` | string | Role: admin, user, view_only |
| `active` | boolean | Account active |
| `lastLogin` | Timestamp | Last sign-in |
| `createdAt`, `updatedAt` | Timestamp | Bookkeeping |

**Index:** `(active ASC, email ASC)`

---

#### `preregistrations/{encodedEmail}`

Pre-register users before first login. Document ID = email with `@` and `.` replaced by `_`.

| Field | Type | Description |
|---|---|---|
| `email` | string | User email |
| `groupId` | string | Role to assign |
| `createdAt` | Timestamp | When pre-registered |

---

#### `documents/{documentId}`

Global registry of uploaded documents.

| Field | Type | Description |
|---|---|---|
| `type` | string | Document type |
| `holder` | string | Document holder name |
| `key`, `number` | string | Reference keys |
| `metadata` | object | Additional data |
| `userId`, `orderId` | string? | Foreign keys |
| `createdAt`, `updatedAt` | Timestamp | Bookkeeping |

---

#### ANVISA Module Collections

Prefixed with `anvisa_` for namespace isolation.

| Collection | Purpose |
|---|---|
| `anvisa_requests/{requestId}` | Authorization requests with status, document references, confirmation number, `orderId` FK |
| `anvisa_userProfiles/{userId}` | Modelo Solicitante — requester profiles for form autofill |
| `anvisa_defaultProfile/{docId}` | Default profile template |
| `anvisa_deleted_requests/{requestId}` | Audit trail of soft-deleted requests |
| `anvisa_roles_admin/{userId}` | ANVISA module admin roles |

Each request has subcollections: `pacienteDocuments`, `procuracaoDocuments`, `comprovanteResidenciaDocuments`, `receitaMedicaDocuments`.

---

#### Supporting Collections

| Collection | Purpose |
|---|---|
| `roles_admin/{userId}` | Dynamic admin role assignments |
| `exchangeQuotes/{quoteId}` | Currency exchange quotes for payments |
| `paymentMethods/{paymentMethodId}` | Payment method configurations and installment plans |
| `medicalSpecialties/{specialtyId}` | Lookup table for doctor specialties |

---

### Entity Relationships

```
users ──1:N──> orders (via createdById)
clients ──1:N──> orders/customer (via userId)
doctors ──1:N──> orders/doctor (via userId)
representantes ──1:N──> orders/representative (via userId)
products ──M:N──> stocks (via stockProducts junction)
stockProducts ──1:N──> orders/products (via stockProductId)

orders ──1:1──> prescriptions (SAME document ID = Receita ID)
orders ──1:N──> payments, paymentLinks, documentRequests
orders ──1:1──> customer, representative, doctor, shipping (subcollections)
orders ──1:0..1──> anvisa_requests (via anvisaRequestId)
```

---

## 6. Risks

### Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **ANVISA portal DOM changes** | High | High | The Chrome extension relies on specific CSS selectors and DOM structure of the gov.br ANVISA portal. Any redesign of the portal will break the extension. There is no API alternative — ANVISA only offers a web form. Monitor the portal for changes; maintain a test suite of expected selectors. |
| **GlobalPay API instability** | Medium | Medium | GlobalPay uses non-standard conventions (`statusCode === 1` for success, custom error codes). Documentation is sparse. The integration has 40+ error code mappings that were reverse-engineered. New error codes may appear without notice. |
| **TriStar API in sandbox mode** | High | Certain | The TriStar API URL is currently set to sandbox (`https://sandbox.tristarexpress.com/v1/`). Before going live with TriStar shipping, this must be switched to production AND the API behavior validated against real shipments. The inventory sync endpoint is not yet known. |
| **Firestore batch write limits** | Low | Low | Firestore limits batch writes to 500 operations. CSV import chunks at 80 rows to stay safe. If order subcollections grow significantly, single-order creation could approach limits. Currently well within bounds. |
| **AI OCR accuracy** | Medium | Medium | Gemini OCR extraction depends on image quality. Poor scans, handwritten prescriptions, or unusual formats may produce incorrect field values. The system shows confidence scores and allows manual correction, but operators must verify. |
| **Exchange rate timing** | Low | Low | PTAX rates are fetched at order creation time and stored with the order. If there is a significant delay between order creation and payment, the rate used may differ from the actual rate at payment time. Currently mitigated by the 30-minute cache and the fact that most payments happen within 24 hours. |

### Regulatory Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **ANVISA process changes** | High | Medium | ANVISA may change their import authorization process, required documents, or form fields at any time. The current system is tightly coupled to the existing ANVISA workflow. Any regulatory changes require both code and extension updates. |
| **Patient data privacy (LGPD)** | High | Low | The platform stores sensitive patient data (CPF, RG, medical prescriptions, health conditions). Brazil's LGPD (General Data Protection Law) requires explicit consent, data minimization, and breach notification. Current implementation stores data in Firestore with domain-restricted access, but there is no explicit LGPD consent workflow or data retention policy. |
| **Cross-border payment compliance** | Medium | Low | USD-to-BRL transactions through GlobalPay must comply with Brazilian Central Bank regulations. The platform stores exchange rates for audit purposes, but compliance is primarily GlobalPay's responsibility. |

### Operational Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Key person dependency** | High | Certain | The platform was built by a single developer. Knowledge transfer via this document and inline code comments. All secrets are managed via Firebase App Hosting secrets (not in code). |
| **Chrome extension distribution** | Medium | Medium | The extension is distributed as a manual `.zip` download, not through the Chrome Web Store. This means no automatic updates — users must manually download and reinstall new versions. Consider Chrome Web Store publication for automatic updates. |
| **Firebase vendor lock-in** | Medium | Low | The entire backend is Firebase (Auth, Firestore, Storage, Functions, Hosting). Migration to another provider would require rewriting the data layer, authentication, and deployment pipeline. This is acceptable for the current scale. |

---

## 7. Constraints

### Technical Constraints

| Constraint | Impact |
|---|---|
| **Firebase App Hosting** | Deployment is tied to GitHub repo `venda-integracao` on branch `main`. Auto-deploys on push. Backend name: `vend-backend`. Max 4 instances, 512 MiB memory each. |
| **Firestore (NoSQL)** | No joins, no transactions across collections (batches are within a single commit). Denormalization is required. Queries require pre-declared composite indexes. |
| **Google OAuth only** | No username/password authentication. All users must have `@entouragelab.com` Google Workspace accounts. |
| **Server-side API keys** | All external API calls (GlobalPay, ZapSign, TriStar, Gemini) must go through Next.js API routes or Cloud Functions — never from the browser client. |
| **Firestore security rules** | Rules are declarative and cannot call external services. Complex authorization logic must be duplicated between client-side code and rules. |
| **Chrome extension (Manifest V3)** | Content scripts run in page context. Service workers replace background pages. No `eval()` or remote code loading. |
| **TriStar sandbox** | Currently pointed at sandbox URL. Production migration requires URL change and testing. |
| **Cloud Functions region** | Functions deployed to `us-central1`. Must match Firestore region for low-latency triggers. |

### Resource Constraints

| Constraint | Impact |
|---|---|
| **Small team** | 1-3 operators use the platform. Features should prioritize reliability over scale. |
| **Budget** | Firebase Blaze plan (pay-as-you-go). Genkit AI calls have per-request costs. Minimize unnecessary AI processing. |
| **No staging environment** | Currently no separate staging/dev Firebase project. All testing happens against production data (with soft deletes as a safety net). Consider creating a staging project for the new developer. |

### Business Constraints

| Constraint | Impact |
|---|---|
| **Brazilian regulatory compliance** | All patient-facing documents must comply with ANVISA requirements. CPF validation is mandatory. Prescriptions must be stored for regulatory audit. |
| **Portuguese language** | All UI must be in Brazilian Portuguese. Error messages, labels, status names — everything the operator sees. |
| **WhatsApp-centric communication** | Clients are contacted via WhatsApp, not email. All "send to client" actions generate WhatsApp deep links. |
| **USD pricing, BRL payment** | Products are priced in USD, but patients pay in BRL. PTAX exchange rate conversion is mandatory for every order. |

---

## 8. Future

### Planned Features

| Feature | Priority | Description |
|---|---|---|
| **TriStar inventory sync** | High | Implement real-time or daily inventory sync between the platform and TriStar Express warehouse in Miami. A placeholder API route exists at `/api/tristar/inventory/route.ts`. The TriStar inventory API endpoint is not yet documented — research required. |
| **TriStar production migration** | High | Switch `TRISTAR_API_URL` from sandbox to production (`https://api.tristarexpress.com/v1/`). Validate all shipment creation, tracking, and label flows against real shipments. |
| **Enhanced ANVISA automation** | High | The Chrome extension currently handles approximately 75% of ANVISA form fields. Remaining gaps include some dropdown menus and file uploads on the gov.br portal. Options explored: (1) Enhanced Chrome Extension (recommended — lowest cost, leverages existing architecture), (2) Selenium/Playwright server-side automation (higher cost, maintenance burden, bot detection risk), (3) Hybrid approach. |
| **Staging environment** | Medium | Create a separate Firebase project for development/staging with isolated Firestore, Auth, and Storage. Currently all development tests against production. |
| **LGPD compliance** | Medium | Implement explicit consent workflow for patient data, data retention policies, right-to-deletion support, and breach notification procedures. |
| **Chrome Web Store publication** | Medium | Publish the ANVISA extension to the Chrome Web Store for automatic updates instead of manual `.zip` distribution. |
| **Automated testing** | Medium | The project currently has minimal test coverage. Add unit tests for business logic (order status helpers, exchange rate calculations) and integration tests for API routes (webhooks, payment flows). |
| **Notification system** | Low | Push notifications or email alerts when orders change status (payment received, document signed, ANVISA approved). Currently operators must check the Pedidos page manually. |
| **Reporting & analytics** | Low | Dashboard with sales metrics, conversion rates, average processing time, revenue by representative. Currently the Dashboard page is minimal. |
| **Multi-language support** | Low | English UI option for Miami-based operators. Currently hardcoded Portuguese only. |

### Architecture Recommendations for New Developer

1. **Read the codebase in this order**: `src/types/` (data shapes) → `src/services/` (data operations) → `src/lib/` (business logic) → `src/app/api/` (API routes) → `src/components/` (UI) → `src/app/(app)/` (pages).

2. **Key patterns to understand**:
   - `useCollection<T>(query)` — real-time Firestore subscription hook. Used everywhere for live data.
   - `useMemoFirebase(() => query, [deps])` — memoized Firestore query builder. Prevents re-subscription on every render.
   - `useFirebase()` — context provider for `firestore`, `user`, `isAdmin`. Available in all `(app)` pages.
   - Atomic order creation in `orders.service.ts` — the `createOrder` function is the most complex write in the system.

3. **Environment setup**:
   - Copy `.env` values from `apphosting.yaml` (non-secret values are plaintext there).
   - Secrets must be retrieved from Firebase: `firebase apphosting:secrets:access <NAME>`.
   - Install dependencies: `npm install`.
   - Run dev server: `npm run dev`.
   - Deploy: push to `main` branch (auto-deploy) or `firebase apphosting:rollouts:create vend-backend --git-branch main`.

4. **Known technical debt**:
   - Some order fields are legacy from CSV import and are not used by the wizard (`invoiceCorrecao`, `statusOrcamento`, `dataOrcamento`, `lead`, `lote`).
   - The `zapsignDocId` / `zapsignStatus` / `zapsignSignUrl` fields are marked as legacy — new orders use Comprovante de Vinculo (`zapsignCvDocId`) but the old Procuracao fields are still read for backward compatibility.
   - The `inventory` field on `products` is legacy — inventory is now tracked via the `stockProducts` junction table.
   - Super-admin emails are hardcoded in both TypeScript and Firestore rules. Adding a new super-admin requires code changes.

---

## Appendix: Navigation Map

```
/dashboard          Dashboard (entry point after login)
/remessas           Nova Venda (4-step wizard, or ?resume={id} for resumption)
/pedidos            Pedidos (consolidated order tracker)
/controle           Controle (order detail & checklist)
/clientes           Clientes (patient CRUD)
/representantes     Representantes (sales rep CRUD)
/medicos            Medicos (doctor CRUD)
/estoque            Estoque (4 tabs: Miami, Brasil, Catalogo, Locais)
/documentos         Documentos (document management)
/checkout           Pagamentos (payment management)
/anvisa             Solicitacoes (ANVISA request list)
/anvisa/nova        Nova Solicitacao (create ANVISA request)
/anvisa/perfil      Modelo Solicitante (requester profile)
/anvisa/extensao    Extensao (Chrome extension download & guide)
/usuarios           Usuarios (admin-only user management)
/ajuda              Ajuda (help & documentation)
/perfil             Perfil (user profile)
```

## Appendix: Environment Variables

| Variable | Source | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Plain | Firebase client API key |
| `NEXT_PUBLIC_APP_NAME` | Plain | "Entourage Lab" |
| `NEXT_PUBLIC_APP_URL` | Plain | `https://app.entouragelab.com` |
| `PAYMENT_LINK_EXPIRATION_HOURS` | Plain | `24` |
| `GLOBALPAYS_MERCHANT_CODE` | Plain | `4912` |
| `GOOGLE_API_KEY` | Secret | Google AI (Gemini) API key |
| `GLOBALPAY_API_URL` | Secret | GlobalPay base URL |
| `GLOBALPAY_PUB_KEY` | Secret | GlobalPay public key for auth |
| `ZAPSIGN_API_URL` | Plain | `https://api.zapsign.com.br` |
| `ZAPSIGN_SANDBOX` | Plain | `false` |
| `ZAPSIGN_API_KEY` | Secret | ZapSign API key |
| `TRISTAR_API_URL` | Plain | `https://sandbox.tristarexpress.com/v1/` |
| `TRISTAR_API_KEY` | Secret | TriStar Express API key |

## Appendix: Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15.5.10 |
| UI Library | React | 19.1.0 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui (Radix primitives) | Latest |
| Icons | Lucide React | Latest |
| Forms | React Hook Form + Zod | Latest |
| Database | Firebase Firestore | 11.10.0 (client SDK) |
| Auth | Firebase Authentication | Google OAuth |
| Storage | Firebase Storage | File uploads |
| Hosting | Firebase App Hosting | Auto-scaling |
| Cloud Functions | Firebase Functions | Node.js 20 |
| AI | Google Genkit + Gemini | 1.29.0 |
| Package Manager | npm | Latest |

---

*This document was prepared for developer handoff. For questions, contact the Entourage Lab engineering team.*
