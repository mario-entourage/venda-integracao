# Functional & Nonfunctional Requirements

> Entourage PhytoLab — Sales Integration Platform

---

## Functional Requirements

### FR-01 Nova Venda (New Sale Wizard)

| ID | Requirement |
|---|---|
| FR-01.1 | A 3-step wizard guides the user through creating a new order: Identification → Payment → Documentation. |
| FR-01.2 | **Step 0 — Identification**: User selects or creates a client (patient), doctor, representative, and adds products with negotiated BRL pricing. A prescription image can be uploaded. |
| FR-01.3 | The system fetches the current PTAX exchange rate (BCB) and stores it with the order. |
| FR-01.4 | **Step 1 — Payment**: A payment link is auto-generated via GlobalPay. The user can set frete (shipping cost), toggle Comprovante de Vínculo, and enter Signatário details (name + CPF) for the Comprovante. |
| FR-01.5 | **Step 2 — Documentation**: Uploads are classified by AI (Gemini). The system auto-generates a ZapSign Comprovante de Vínculo document based on the toggle from Step 1. Document request statuses are tracked per document type. |
| FR-01.6 | The order, all subcollections, and the prescription record are created atomically. The order and prescription share the same Firestore document ID (Receita ID). |

### FR-02 Pedidos (Orders Module)

| ID | Requirement |
|---|---|
| FR-02.1 | Display a filterable list of in-progress orders (pending through paid). |
| FR-02.2 | Each order shows a granular status badge (e.g., "Falta Pagamento + ANVISA") computed from missing items. |
| FR-02.3 | All orders show "Falta ANVISA" until `anvisaStatus` is CONCLUIDO. |
| FR-02.4 | Comprovante de Vínculo is flagged as missing only if a ZapSign document was created but not yet signed. |
| FR-02.5 | Action menu per order provides: view details, regenerate payment link, open signing URLs. |

### FR-03 Controle (Order Management)

| ID | Requirement |
|---|---|
| FR-03.1 | Detailed order view with metadata, products, and manual status override actions. |
| FR-03.2 | "Mark as Signed" button for Comprovante de Vínculo documents. |
| FR-03.3 | Manual "Mark as Paid" action for advancing order status. |
| FR-03.4 | CSV bulk import (admin-only) with column mapping, validation, duplicate detection, and batch creation in chunks of 80 rows. |
| FR-03.5 | Date-range filtering for order lists. |

### FR-04 ANVISA Solicitations

| ID | Requirement |
|---|---|
| FR-04.1 | Create and manage ANVISA import authorization requests. |
| FR-04.2 | Upload and classify documents (patient ID, proof of residence, prescription, procuração) with AI-powered OCR extraction. |
| FR-04.3 | Track request status: PENDENTE → EM_AJUSTE → EM_AUTOMACAO → CONCLUIDO / ERRO. |
| FR-04.4 | AI suggests field corrections when extracted data is incomplete or inconsistent. |
| FR-04.5 | Modelo Solicitante: user profile management for ANVISA requester details (name, email, RG, address, phone). Autofills the solicitation form. |
| FR-04.6 | Chrome extension (ANVISA Auto-Fill) receives extracted OCR data from the web app and automatically fills the ANVISA portal form. Dedicated download and installation page at `/anvisa/extensao`. |
| FR-04.7 | Validation step warns when Modelo Solicitante is not configured and links to the configuration page. |

### FR-05 Clients / Doctors / Representatives

| ID | Requirement |
|---|---|
| FR-05.1 | CRUD operations for clients (patients), doctors, and sales representatives. |
| FR-05.2 | Search by name with active-only filtering. |
| FR-05.3 | Representatives can optionally be linked to a system user account. |
| FR-05.4 | Client address stored for document generation (Comprovante de Vínculo). |

### FR-06 Products & Inventory

| ID | Requirement |
|---|---|
| FR-06.1 | Maintain a product catalog with SKU, HS code, concentration, and USD list price. |
| FR-06.2 | Stock locations with product-to-stock quantity tracking (many-to-many). |
| FR-06.3 | Admin-only product seeding via API endpoint. |

### FR-07 Shipping

| ID | Requirement |
|---|---|
| FR-07.1 | Create shipments via TriStar Express API with address, weight, and dimensions. |
| FR-07.2 | Track shipment status and retrieve tracking codes. |
| FR-07.3 | Generate and download shipping labels. |
| FR-07.4 | Support multiple carriers: TriStar, local mail (Sedex/PAC), motoboy. |

### FR-08 Users & Access Control

| ID | Requirement |
|---|---|
| FR-08.1 | Google OAuth authentication restricted to `@entouragelab.com` domain. |
| FR-08.2 | Role-based access: admin, user, view_only. |
| FR-08.3 | Super-admin users defined by hardcoded email list. Dynamic admins via `roles_admin` collection. |
| FR-08.4 | Pre-registration system: admins can pre-assign roles before a user's first login. |
| FR-08.5 | User management UI for admins to create, edit, and deactivate accounts. |

### FR-09 Checkout

| ID | Requirement |
|---|---|
| FR-09.1 | Customer-facing payment page accessible via generated payment link. |
| FR-09.2 | Payment confirmation page with order details. |
| FR-09.3 | WhatsApp share button to send payment link to client. |

### FR-10 Help & Documentation

| ID | Requirement |
|---|---|
| FR-10.1 | In-app help page (`/ajuda`) with two sections: web application guide and Chrome extension guide. |
| FR-10.2 | Extension download link and GitHub source link available from the help page and the dedicated `/anvisa/extensao` page. |

---

## Nonfunctional Requirements

### NFR-01 Performance

| ID | Requirement |
|---|---|
| NFR-01.1 | Order list pages load within 2 seconds on standard broadband. |
| NFR-01.2 | PTAX exchange rate cached for 30 minutes to reduce BCB API calls. |
| NFR-01.3 | GlobalPay JWT tokens cached with 60-second refresh buffer. |
| NFR-01.4 | Real-time Firestore listeners for order detail pages (no polling). |

### NFR-02 Reliability

| ID | Requirement |
|---|---|
| NFR-02.1 | Order creation is atomic — all subcollections commit or none do. |
| NFR-02.2 | Non-critical operations (prescription upload, document requests) are non-fatal: failures are logged but do not block order creation. |
| NFR-02.3 | Webhook handlers are idempotent — replayed events do not corrupt state. |
| NFR-02.4 | PTAX rate lookup retries up to 7 days back for weekends/holidays. |

### NFR-03 Security

| ID | Requirement |
|---|---|
| NFR-03.1 | All Firestore operations require Firebase Authentication. |
| NFR-03.2 | Domain restriction: only `@entouragelab.com` users can access the app. |
| NFR-03.3 | Delete operations restricted to admin role in Firestore security rules. |
| NFR-03.4 | Webhook endpoints validate request signatures/tokens. |
| NFR-03.5 | Sensitive API keys stored as environment variables, never in client code. |

### NFR-04 Scalability

| ID | Requirement |
|---|---|
| NFR-04.1 | Firestore composite indexes support all query patterns without full-collection scans. |
| NFR-04.2 | CSV import processes orders in batches of 80 to stay within Firestore's 500-operation batch limit. |
| NFR-04.3 | Firebase App Hosting with auto-scaling (no manual instance management). |

### NFR-05 Auditability

| ID | Requirement |
|---|---|
| NFR-05.1 | Every document tracks `createdAt`, `updatedAt`, `createdById`, `updatedById`. |
| NFR-05.2 | Soft deletes preserve historical records for compliance. |
| NFR-05.3 | Deleted ANVISA requests are archived to a write-protected collection. |

### NFR-06 Usability

| ID | Requirement |
|---|---|
| NFR-06.1 | All UI labels in Brazilian Portuguese. |
| NFR-06.2 | Responsive layout for desktop and tablet use. |
| NFR-06.3 | Loading skeletons for all async data fetches. |
| NFR-06.4 | Inline error messages with retry options. |

### NFR-07 Brand & Visual Identity

| ID | Requirement |
|---|---|
| NFR-07.1 | Brand name displayed as "ENTOURΛGE" (capital Greek lambda for the A). |
| NFR-07.2 | All headings and subheadings use Montserrat font in uppercase (via `font-headline` + `text-transform: uppercase`). |
| NFR-07.3 | Body text uses Inter font family. |
| NFR-07.4 | Background color: Whispering Mist `RGB(234, 234, 234)`. Primary accent: Traditional Turquoise `RGB(3, 145, 163)`. Secondary accent: Teal Blue (Xona) `RGB(9, 61, 91)`. |
| NFR-07.5 | Dark sidebar with Teal Blue background and white icon/text. |
| NFR-07.6 | Brand icon accompanies the "ENTOURΛGE" name in sidebar header, checkout header, and other brand placements. Four icon variants: color, white (255), light gray (234), black (000). |
| NFR-07.7 | Browser tab title shows "ENTOURΛGE". |

---

## Integrations

### INT-01 GlobalPay — Payment Processing

| Attribute | Value |
|---|---|
| **Purpose** | Generate payment links for customer orders and process payment notifications. |
| **Base URL** | `https://api.tryglobalpays.com/v1` (configurable via `GLOBALPAY_API_URL`) |
| **Authentication** | Bearer JWT obtained from `POST /paymentapi/auth` using merchant pub key. Token cached with 60-second refresh buffer. |
| **Endpoints used** | `POST /paymentapi/auth` — obtain token |
| | `POST /paymentapi/order` — create payment link |
| | `GET /paymentapi/order/{gpOrderId}` — query transaction status |
| | `POST /paymentapi/order/{gpOrderId}/cancel` — cancel transaction |
| **Webhook** | `POST /api/webhooks/payment` — receives payment events, updates order status and payment records in Firestore. |
| **Environment variables** | `GLOBALPAY_API_URL`, `GLOBALPAY_PUB_KEY`, `GLOBALPAYS_MERCHANT_CODE` |

### INT-02 ZapSign — Electronic Document Signing

| Attribute | Value |
|---|---|
| **Purpose** | Generate and track electronic signatures for Comprovante de Vínculo documents. |
| **Base URL** | `https://api.zapsign.com.br` (configurable via `ZAPSIGN_API_URL`) |
| **Authentication** | Bearer API key in `Authorization` header. |
| **Endpoints used** | `POST /api/v1/docs/` — create document with signer from markdown template. |
| **Document type** | **Comprovante de Vínculo**: two-person format — Signatário (name + CPF) declares that Cliente (name + CPF) resides at a given address. |
| **Webhook** | `POST /api/webhooks/zapsign` — receives `doc_signed` events, updates `zapsignCvStatus` on the order. Correlates via `external_id` = orderId. |
| **Environment variables** | `ZAPSIGN_API_URL`, `ZAPSIGN_API_KEY`, `ZAPSIGN_SANDBOX` |

### INT-03 BCB PTAX — Exchange Rates

| Attribute | Value |
|---|---|
| **Purpose** | Fetch daily USD → BRL reference exchange rates from the Central Bank of Brazil for order pricing. |
| **Base URL** | `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/` |
| **Authentication** | None (public OData API). |
| **Endpoints used** | `GET CotacaoDolarDia(dataCotacao=@dataCotacao)` — daily dollar quote. |
| **Caching** | 30-minute TTL for "today" lookups. Historical lookups bypass cache. |
| **Retry logic** | Walks back up to 7 days if rate unavailable (weekends/holidays). |
| **Environment variables** | None required. |

### INT-04 TriStar Express — Shipping & Logistics

| Attribute | Value |
|---|---|
| **Purpose** | Create shipments, generate labels, and track delivery status for customer orders. |
| **Base URL** | `https://sandbox.tristarexpress.com/v1/` (configurable via `TRISTAR_API_URL`) |
| **Authentication** | Bearer API key. |
| **Endpoints used** | `POST /shipments` — create shipment |
| | `GET /tracking/{shipmentId}` — track status |
| | `POST /shipments/{shipmentId}/label` — generate label |
| | `POST /shipments/{shipmentId}/confirm` — confirm dispatch |
| **Environment variables** | `TRISTAR_API_URL`, `TRISTAR_API_KEY` |

### INT-05 Google Gemini 2.5 Flash — AI Document Processing

| Attribute | Value |
|---|---|
| **Purpose** | Classify uploaded documents (ID cards, prescriptions, proofs of residence) and extract structured data via OCR. |
| **SDK** | `@genkit-ai/google-genai` (Google Genkit framework) |
| **Model** | `googleai/gemini-2.5-flash` |
| **Capabilities** | Document classification (4 types), OCR field extraction, prescription data extraction, field correction suggestions. |
| **Input format** | Base64-encoded data URLs (`data:image/jpeg;base64,...`) |
| **Output format** | Typed JSON schemas with confidence scores. |
| **Environment variables** | `GOOGLE_GENAI_API_KEY` |

### INT-06 Firebase — Backend Infrastructure

| Attribute | Value |
|---|---|
| **Services used** | **Authentication** (Google OAuth, domain restriction), **Firestore** (document database), **Storage** (file uploads), **App Hosting** (deployment). |
| **Admin SDK** | Used server-side for webhook processing and product seeding. Authenticates via Application Default Credentials. |
| **Security rules** | Domain-restricted reads/writes. Admin-only deletes. Subcollection access follows parent order permissions. |
| **Deployment** | Firebase App Hosting with GitHub-triggered rollouts from `main` branch. Manual trigger: `firebase apphosting:rollouts:create vend-backend --git-branch main`. |
| **Environment variables** | `NEXT_PUBLIC_FIREBASE_*` (6 client config vars), `GOOGLE_CLOUD_PROJECT` |

### INT-07 ANVISA Auto-Fill Chrome Extension

| Attribute | Value |
|---|---|
| **Purpose** | Automatically fill the ANVISA import authorization portal form with OCR-extracted data from the web app. |
| **Communication** | The web app sends extracted data to the extension via browser messaging (`window.postMessage` or Chrome extension messaging API). |
| **Workflow** | 1) User uploads documents in Nova Solicitação. 2) AI extracts fields via OCR. 3) User clicks "Enviar para extensão" to transfer data. 4) Extension auto-fills the ANVISA portal form. |
| **Distribution** | Manual installation via `.zip` download from `/extensao-anvisa.zip` or GitHub source. |
| **Source code** | `https://github.com/mario-entourage/Anvisa_app/tree/main/extension` |
