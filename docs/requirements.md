# **Entourage Lab — Sales Integration Platform**

Comprehensive requirements document for developer handoff. Last updated: 2026-03-22

---

## **Letter to the Board**

> **ENTOURAGE LAB — OFFICE OF THE CTO**
>
> To: The Board of Directors, Entourage Lab
>
> Re: Strategic Value of the Sales Integration Platform and Alignment with the Entourage IT Mission Statement
>
> Dear Members of the Board,
>
> I am writing to communicate the significant progress and increased strategic value that our internally developed Sales Integration Platform now represents for Entourage Lab. What began as an operational tool to replace fragmented spreadsheet-and-WhatsApp workflows has matured into a comprehensive, enterprise-grade system that embodies our company's commitment to regulatory excellence, operational integrity, and patient-centered service.
>
> **The Entourage IT Mission Statement** guides every architectural and design decision we make: *to build technology that consolidates complexity into clarity, that respects the intelligence of our operators, that treats regulatory compliance as a first-class engineering concern, and that protects patient data with the same diligence we apply to the medicines we deliver.* This platform is the living expression of that mission.
>
> In this latest release cycle, we have made three investments that directly reflect these values:
>
> **1. Comprehensive Audit Logging.** Every mutation to patient records, order data, client information, physician records, and user accounts is now tracked with full attribution — who performed the action, when, and exactly what changed. This is not merely a technical feature; it is our commitment to regulatory accountability. In a business that handles controlled pharmaceutical imports under ANVISA oversight, the ability to produce a complete audit trail for any data change is both a compliance requirement and a trust signal to our regulators and partners.
>
> **2. Hardened API Security.** All server-side API routes now enforce authentication verification and structured input validation using Zod schemas. Webhook endpoints from our payment and e-signature partners verify cryptographic tokens before processing any event. These measures protect against unauthorized access, malformed data injection, and payload tampering — safeguarding both our systems and the sensitive patient data they contain.
>
> **3. TriStar Express Integration Rebuild.** Our international shipping integration with TriStar Express has been rebuilt from the ground up to match the actual API specification, with support for multi-item shipments, proper customs declaration fields, and ANVISA authorization data per item. This enables our Miami warehouse to fulfill complex orders containing multiple product types in a single shipment — reducing shipping costs, accelerating delivery to patients, and eliminating manual data re-entry between systems. We have completed API homologation testing and are prepared to transition to the production environment.
>
> Together, these improvements transform the platform from an operational convenience into a defensible competitive asset. The audit trail provides regulatory confidence that no spreadsheet can match. The API security posture protects our patients' data at a standard that reflects the pharmaceutical-grade trust our brand represents. And the shipping integration directly reduces the time between a patient's payment and their receipt of medication — which is, ultimately, the outcome that matters most.
>
> The platform now processes the complete sale lifecycle — from prescription intake through payment, regulatory authorization, document signing, and international delivery — in a single integrated workflow. Every step is tracked, every mutation is logged, and every external integration is validated and secured. This is technology built not to impress, but to serve — and I believe it reflects the best of what Entourage Lab stands for.
>
> Respectfully submitted,
>
> **Mario Bonifacio**
> Chief Technology Officer, Entourage Lab
>
> CC: Caio — CEO, Entourage Lab

---

## **Table of Contents**

1. [Goal](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#1-goal)  
2. [Purpose and Philosophy](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#2-purpose-and-philosophy)  
3. [Stakeholders](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#3-stakeholders)  
4. [Requirements](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#4-requirements)  
5. [Database](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#5-database)  
6. [Risks](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#6-risks)  
7. [Constraints](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#7-constraints)  
8. [Future](https://file+.vscode-resource.vscode-cdn.net/Users/mariobonifacio/Projects/sales_integration/docs/requirements.md#8-future)

---

## **1\. Goal**

Entourage Lab is a U.S. pharmaceutical company that sends cannabis-based medicinal products (CBD, THC) from the United States for sale in Brazil. Every sale requires regulatory authorization from ANVISA (Brazil's FDA equivalent), legal documentation, and international shipping logistics.

This platform is the internally facing operations system that manages the entire sale lifecycle — from the moment a sales representative takes an order through payment processing, regulatory compliance, document signing, and final delivery to the patient.

### **What the platform does**

1. Creates sales orders via a guided 5-step wizard (select patient/doctor/products with shipping cost, generate payment link, create e-signature documents, send everything to the client, and select shipping method).  
2. Tracks order progress through a multi-condition checklist: payment confirmation, document signing, ANVISA authorization, document completeness, and shipping.  
3. Automates ANVISA submissions by extracting data from uploaded documents via AI (Google Gemini OCR) and auto-filling the ANVISA government portal via a Chrome browser extension.  
4. Manages inventory across two physical locations: Miami (USA, via TriStar Express warehouse) and Brazil (local).  
5. Processes payments through GlobalPay, a cross-border payment gateway that handles USD-to-BRL conversion.  
6. Handles shipping through three methods: TriStar Express (international from Miami), Correios/Sedex (domestic Brazil), and motoboy (local delivery).

### **What success looks like**

An operator can process a sale from start to delivery without leaving the platform. The system handles payment links, e-signatures, exchange rates, regulatory filings, and shipping labels. Manual data entry between systems is eliminated.

---

## **2\. Purpose and Philosophy**

### **Why this platform exists**

Before this platform, operators managed sales across spreadsheets, WhatsApp, email, and multiple government websites. Each sale required manually copying patient data between 4-5 systems, manually calculating exchange rates, and manually filling ANVISA forms field by field. A single sale could take 2-3 hours of operator time.

This platform consolidates all of those workflows into one system.

### **Design philosophy**

| Principle | Rationale |
| :---- | :---- |
| Single source of truth | Every piece of order data lives in one Firestore document tree. No data is duplicated across spreadsheets or external systems. |
| Wizard-driven creation, checklist-driven tracking | Creation is synchronous (4 wizard steps in one session). Tracking is asynchronous (operator monitors a checklist that updates as the client pays, signs, etc.). |
| Fail gracefully, never lose data | Non-critical operations (ZapSign creation, prescription upload) are non-fatal. If they fail, the order is still created and the operator can retry from the detail page. |
| Soft deletes everywhere | No data is ever physically deleted. Records are flagged as inactive/deleted, preserving full audit trails for regulatory compliance. |
| Atomic writes for consistency | The entire order (root document \+ 8 subcollections) is created in a single Firestore batch write. It either all succeeds or all fails. |
| Portuguese-first UI | All labels, messages, and user-facing text are in Brazilian Portuguese. The codebase (variable names, comments) is in English. |
| Domain-locked access | Only @entouragelab.com Google accounts can access the platform. This is enforced at both the Firebase Auth level and in Firestore security rules. |

### **User experience philosophy**

The operators who use this platform spend hours each day moving sales through a multi-step regulatory pipeline. Every interaction should respect their time and reduce cognitive load.

| Principle | How it manifests |
| :---- | :---- |
| Reduce clicks, not choices | Wizards auto-fill from prior data (OCR, database matches, default profiles) but every field remains editable. The system does the work; the operator keeps control. |
| Progressive disclosure | Only show what matters for the current step. Details live in expandable sections or linked detail pages — never in a wall of fields. The sidebar groups links by workflow stage (*Vendas* → *Cadastros* → *Documentos* → etc.) so the operator's eye follows the natural order of a sale. |
| Warnings, not blocks | Prescription age, quantity mismatches, and duplicate prescriptions surface as prominent toasts and amber highlights — not modal blockers. Operators can acknowledge and override because real-world edge cases are common. Admins get an explicit override checkbox when needed. |
| Immediate feedback | Upload progress shows per-file with the filename. AI classification results appear inline the moment they finish. Payment sync results appear in-place. No full-page reloads, no "please wait" screens that hide what happened. |
| Forgiving navigation | The wizard supports back-navigation without data loss. "Continue Sale" resumes exactly where the operator left off. Accidentally closing a tab doesn't lose the order — it lives in Firestore and can be resumed from the Controle detail page. |
| Mobile-conscious, desktop-first | The primary users work at desks with wide screens. Layouts optimize for 1200px+ viewports but remain usable on tablets. Grid columns collapse gracefully; the sidebar collapses to icons. |
| Respect the user's intelligence | Operators are professionals who understand their domain. The UI should inform, not lecture. Avoid redundant confirmation dialogs for routine actions, don't over-explain obvious buttons with tooltips, and never patronize with "Are you sure?" on non-destructive actions. Trust that the operator knows what they're doing — surface the information they need and get out of the way. |

### **Aesthetic philosophy**

The platform's visual identity should feel professional, trustworthy, and calm. Operators interact with it all day — it should be pleasant to look at, never fatiguing.

| Principle | Guideline |
| :---- | :---- |
| Brand presence without noise | The Entourage logo and teal brand color anchor the sidebar header and login screen. The word *Vendas* in the Meddon cursive font adds warmth and distinguishes this module from future Entourage tools. Beyond these anchor points, the brand recedes — the content is the focus. |
| Neutral canvas, purposeful color | The base palette is white, slate, and muted gray (shadcn/ui defaults). Color is reserved for meaning: teal for primary actions and brand, amber for warnings, red for destructive actions and errors, green for success confirmations. Status badges use soft-tinted borders (blue, purple, orange, etc.) to be scannable without being loud. |
| Typographic hierarchy | Montserrat (font-headline) for page titles and branding text. Inter (font-body) for everything else — tables, forms, labels, prose. Meddon (cursive) is used only for the *Vendas* wordmark on the login screen and sidebar heading — always title-case "Vendas", never "VENDAS" or "vendas". No more than three font families anywhere. |
| Whitespace is a feature | Cards have generous padding. Table rows breathe. Form sections are spaced with `space-y-6`. Crowding signals a design problem, not a content problem. |
| Consistent component vocabulary | Buttons, badges, selects, inputs, dialogs, and toasts all come from shadcn/ui with minimal customization. If a pattern exists in the component library, use it — don't invent a new one. This keeps the interface predictable. |
| Subtle motion | Loading skeletons pulse gently. Toasts slide in. Hover states transition colors. Nothing bounces, flashes, or demands attention. Animation serves confirmation ("something happened") not decoration. |
| Don't be trashy | No gratuitous gradients, drop shadows stacked on drop shadows, or decorative elements that serve no purpose. No emoji in professional UI (unless the user explicitly asks). No "fun" copy in error messages — be clear and direct. The platform handles pharmaceutical imports and regulatory compliance; it should look like it. Cheap visual tricks erode trust. When in doubt, leave it out. |

### **Architecture overview**

* Frontend: Next.js 15 (App Router) with React 19, TypeScript, Tailwind CSS, shadcn/ui components  
* Backend: Firebase ecosystem — Firestore (database), Firebase Auth (authentication), Firebase Storage (file uploads), Firebase App Hosting (deployment), Cloud Functions (OCR pipeline)  
* AI: Google Genkit with Gemini 2.5 Flash/Pro for document classification and OCR extraction  
* Integrations: GlobalPay (payments), ZapSign (e-signatures), TriStar Express (shipping), BCB PTAX (exchange rates)  
* Browser extension: Chrome Manifest V3 extension for ANVISA portal auto-fill

---

## **3\. Stakeholders**

### **Users**

| Role | Access level | Description |
| :---- | :---- | :---- |
| Admin | Full access | Can create/edit/delete all records, manage users, perform batch operations, access all modules. Currently: caio@entouragelab.com, mario@entouragelab.com (hardcoded super-admins), plus dynamic admins via roles\_admin collection. |
| User (Operator) | Standard access | Can create sales, manage orders, process ANVISA requests, manage clients/doctors. Cannot delete records or manage other users. |
| View Only | Read-only access | Can view orders and data but cannot create or modify records. |

### **External parties**

| Party | Interaction |
| :---- | :---- |
| Patients (clients) | Receive payment links and e-signature requests via WhatsApp. Access the customer-facing checkout page (/checkout/{orderId}) to complete payment. Never log into the platform. |
| Doctors | Their prescription and CRM data are stored in the system. They never interact with the platform directly. |
| Sales representatives | May or may not have platform accounts. Their contact info is recorded on each order. |
| ANVISA | Government regulatory body. Operators submit import authorization requests through the ANVISA gov.br portal. The Chrome extension auto-fills the portal form. |
| GlobalPay | Payment gateway. Sends webhook notifications when payments are completed. |
| ZapSign | E-signature provider. Sends webhook notifications when documents are signed. |
| TriStar Express | Shipping partner in Miami. API used to create shipments and generate labels. |
| BCB (Central Bank of Brazil) | Public API provides daily PTAX exchange rates for USD/BRL conversion. |

### **Pre-registration system**

Admins can pre-register users before their first login via the preregistrations collection. When a pre-registered user signs in with Google OAuth for the first time, their role is automatically assigned based on the pre-registration record. Document ID \= email with @ and . replaced by \_.

---

## **4\. Requirements**

### **Order Lifecycle**

The platform follows a two-phase order lifecycle:

Phase 1 — Operator Setup (Nova Venda Wizard)

```
Step 0  Identification    Select client, doctor, representative,
                          products.
                          Upload prescription. Fetch PTAX
                         exchange rate. Add Frete (ship cost)
                          Configure allowed payment methods.
Step 1  Payment           Create GlobalPay payment link.

Step 2  Documents         Create ZapSign e-signature documents if needed                          (Comprovante de Vinculo and/or Procuracao).
                          Enter Signatario details (name + CPF).
Step 3  Send to Client    Review summary. Copy/share payment + signing links
                          via WhatsApp. Order created atomically.
Step 4  Shipping          Select shipping method (TriStar, Correios, or Motoboy).
```

Phase 2 — Async Resolution (Checklist Tracking)

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

Ready-to-Ship Predicate: An order is "ready to ship" when ALL of these conditions are met:

* Status is paid  
* documentsComplete is true  
* ANVISA is either exempt OR anvisaStatus \=== 'CONCLUIDO'  
* All ZapSign documents are signed (if any were created)

When an order is ready to ship, the UI highlights it with an emerald accent and shows shipping action buttons (TriStar, Correios, Motoboy). Before that point, pre-shipping actions are shown instead (mark paid, upload docs, ANVISA, ZapSign).

Separately, the operator may view a CONTROLE module, with a more detailed list of orders, with more options for status, but with far fewer means of completing orders. Only questions or details that cannot be addressed elsewhere should be editable in the CONTROLE module

---

### **Functional Requirements**

#### **FR-01 Nova Venda (New Sale Wizard)**

| ID | Requirement |
| :---- | :---- |
| FR-01.1 | A 5-step wizard guides the operator through order setup: Identification, Payment, Documents, Send to Client, Shipping. The wizard may be completed in a single session or multiple sessions. |
| FR-01.2 | Step 0 — Identification: Upload a prescription image. Select or create a client (patient), doctor, representative. Add Frete (ship cost). Add products with negotiated BRL pricing and allowed payment methods.  |
| FR-01.3 | The system fetches the current PTAX exchange rate (BCB) and stores it with the order for contemporaneous USD/BRL conversion. |
| FR-01.4 | Step 1 — Payment: A payment link is generated via GlobalPay.. The system must submit a programmatically created invoice number of the format AAAAAA\#\#\#\#\# where the first four characters are “ETGA,” the next two characters are the initials of the associated sales rep, and the final five numbers are sequentially increased one at a time across the company. |
| FR-01.5 | Step 2 — Documents: The user indicates whether a Comprovante de Vinculo or Procuracao is needed. If yes, the user enters Signatario details (name \+ CPF) and the system creates ZapSign document(s). |
| FR-01.6 | Step 3 — Send to Client: Displays a summary of everything created (payment link, ZapSign links if any). Provides copy/share buttons (including WhatsApp deep link) to send all links to the client. |
| FR-01.7 | The order, all subcollections, and the prescription record are created atomically in a single Firestore batch write. Because an order can only be created with a prescription, the order and prescription share the same document ID (Receita ID). |
| FR-01.8 | Resume mode: An incomplete order can be resumed via ?resume={orderId} URL parameter. This renders the full wizard pre-populated with existing order data (customer, doctor, products, payment links), starting at the appropriate step based on order state. |
| FR-01.9 | Prescription age warning: When the operator enters or changes the prescription date, if the prescription is 5 or more months old, a toast warning is shown with the prescription age and expiry date (6-month validity). |
| FR-01.10 | Prescribed quantity tracking: Each product line has an optional "Qtd Prescrita" (prescribed quantity) field. If the order quantity exceeds the prescribed quantity, the system shows a warning toast and highlights the quantity input with an amber border. |
| | **Design decision — Data source for prescribed quantity:** |
| | **Option A (chosen): Operator manually enters the prescribed quantity per product line.** The operator reads the prescription and types the quantity into a "Qtd Prescrita" input next to each product row. On blur of the order quantity field, the system compares and warns if order qty > prescribed qty. |
| | **Option B (not chosen): AI extracts prescribed quantity from the prescription image.** The classify-document AI flow would also extract per-product quantities from the uploaded prescription via Gemini vision, auto-populating the prescribed qty fields. **Why it might be right:** eliminates manual data entry, reduces operator error, and is faster for high-volume workflows. **Why it was not chosen:** prescription formats vary widely (handwritten, typed, different layouts), making reliable extraction difficult; the operator already reviews the prescription anyway; and a wrong AI extraction that goes unnoticed is worse than no extraction at all. This option can be revisited once AI accuracy is validated on a representative sample of real prescriptions. |
| FR-01.11 | Post-finalization shipping choice: After the wizard is finalized, a dialog presents two shipping options — "TriStar Express" (opens TriStar shipment dialog pre-populated with order data) or "Enviar do Brasil" (sends an email notification to the fulfillment team with the order summary). The "Enviar do Brasil" option sends the notification email to adm@entouragelab.com. |
| | **Design decision — Email recipient for "Enviar do Brasil":** |
| | **Option A (chosen): Hardcoded to adm@entouragelab.com.** The notification email is always sent to the admin shared mailbox. Simple, predictable, and avoids single-point-of-failure by going to a shared address rather than an individual. |
| | **Option B (not chosen): Configurable recipient stored in Firestore settings.** An admin screen would allow changing the notification recipient without a code deploy. **Why it might be right:** if Caio's role changes, or if different products/regions need different fulfillment contacts, a hardcoded email becomes a bottleneck requiring developer intervention. Also more robust for team scaling — new fulfillment staff could be added without code changes. |
| | **Option C (not chosen): Email a distribution list or multiple recipients.** Send to a shared inbox (e.g., fulfillment@entouragelab.com) or multiple addresses. **Why it might be right:** avoids single-point-of-failure if Caio is unavailable; ensures backup coverage; standard practice for operational workflows. **Why it was not chosen:** the team is small, Caio is the sole fulfillment coordinator today, and adding a distribution list adds setup overhead with no current benefit. Can be changed later by updating the hardcoded address or upgrading to Option B. |

#### **FR-02 Pedidos (Consolidated Order Tracker)**

| ID | Requirement |
| :---- | :---- |
| FR-02.1 | Display a filterable list of all in-progress orders. Filter options: "Todos em andamento" (all in progress), "Pronto p/ envio" (ready to ship), and individual status values based on missing documents. |
| FR-02.2 | Each order row shows a granular status badge computed from checklist state (e.g., "Falta Pagamento \+ Documentos", "Pronto para Envio"). Missing items are shown as colored pills. |
| FR-02.3 | Orders that satisfy isReadyToShip() are visually highlighted with an emerald accent ring/background. |
| FR-02.4 | Pre-ship actions (shown when order is NOT ready to ship): Mark as Paid, upload Documents, trigger ANVISA, open ZapSign signing URLs. |
| FR-02.5 | Shipping actions (shown when order IS ready to ship): Create TriStar international shipment, create Correios (Sedex/PAC) shipment within Brazil, assign Motoboy or other hand-carried delivery. |
| FR-02.6 | Admin batch operations: select-all checkbox, batch soft-delete with confirmation dialog. |
| FR-02.7 | Per-order actions via dropdown menu: view detail, regenerate payment link, open signing URLs, cancel order, soft-delete. |
| FR-02.8 | ANVISA status is shown as missing ("Falta ANVISA") unless anvisaOption \=== 'exempt' OR anvisaStatus \=== 'CONCLUIDO'. |
|  | Each incomplete item links to its resolution action. |
|  | "Mark as Signed" button for Comprovante de Vinculo and Procuração documents, if applicable. |
|  | Manual "Mark as Paid" action for advancing order status when payment is confirmed outside the webhook flow. |
|  | "Iniciar ANVISA" action is enabled only when payment is confirmed AND ZapSign is signed (if applicable). Links to ANVISA Solicitacao with the order pre-selected. |
|  | Upload area for ANVISA Autorizacao document. Marks anvisaStatus as CONCLUIDO when uploaded. |
|  | Upload area for remaining required documents (patient ID, proof of residence). Tracks per-document status (pending, received, approved, rejected). |

#### **FR-03 Controle (Order Detail & Checklist)**

| ID | Requirement |
| :---- | :---- |
| FR-03.0 | Display a list of all orders with robust filters. Filter options: Start Date, End Date, Order Status. The date options should default to the last 30 days. The list should be paginated when it reaches a certain length. A dropdown should let the user determine how many entries to show at once, with a default value of 30 items per page. The other options for entries per page must be 30, 50, 100, and all. If the user selects to view all, a warning should pop up saying that this might be a lot and asks if they’re sure |
| FR-03.1 | Order detail page displays the full order checklist with real-time status for each item. |
| FR-03.2 | Multi-file drag-and-drop upload: The document upload area accepts multiple files at once. Files are uploaded sequentially with per-file progress indicators, and each completed file is listed by name. |
| FR-03.3 | AI document classification: After each file is uploaded, the system automatically classifies it using Gemini vision AI into one of: prescription, identity, proof_of_address, medical_report, invoice, anvisa_authorization, or general. No manual type dropdown is shown. A "Classificando..." spinner is displayed during classification. The detected type is shown inline with an optional override select. |
| FR-03.4 | Frete display in sales summary: When an order has a shipping cost (frete > 0), the products table footer shows Subtotal (products only), Frete, and Grand Total as separate rows. |
| FR-03.5 | Continue Sale: A "Continuar Venda" action on an order opens the full Nova Venda wizard pre-populated with the order's existing data, resuming from the appropriate step. |
| FR-03.6 |  |
| FR-03.7 | CSV bulk import (admin-only): column mapping, validation, duplicate detection via batchImportId, batch creation in chunks of 80 rows (within Firestore's 500-operation batch limit). |
| FR-03.8 | Date-range filtering for order lists. |
|  | A dropdown should let the user determine how many entries to show at once, with a default value of 30 items per page. The other options for entries per page must be 30, 50, 100, and all. If the user selects to view all, a warning should pop up saying that this might be a lot and asks if they’re sure |

#### **FR-04 ANVISA Solicitations**

| ID | Requirement |
| :---- | :---- |
| FR-04.1 | Order Picker: Nova Solicitacao displays eligible orders — orders with a prescription, payment confirmed, ZapSign signed (if applicable), and no linked ANVISA request. |
| FR-04.2 | Prescription pre-loading: After selecting an order, the prescription file and extracted client/doctor data are imported from the order. No re-upload needed. On subsequent screens, the user should be given a chance to see the Receita image. The user should be informed that they do not need to re-upload the Receita |
|  | Once the user has selected the order, the system should check whether other necessary documents have already been uploaded (patient ID, proof of residence, and power of attorney or proof of residence by relationship) and offer to import data from these documents. The user may select zero, some, or all of these documents. On subsequent screens, the user should be given a chance to see the image for any document they select  |
|  | After the system has checked which documents have already been uploaded and the user has chosen which data to reuse, a checklist will appear. Any document that is already present and which the user has chosen to reuse should already be checked off of this checklist |
| FR-04.3 | Document upload: User uploads remaining documents (patient ID, proof of residence, and power of attorney or proof of residence by relationship). AI classifies and extracts OCR data via Gemini or Google Cloud Vision. |
| FR-04.4 | Status tracking: PENDENTE, EM\_AJUSTE, EM\_AUTOMACAO, CONCLUIDO, ERRO. |
| FR-04.5 | AI suggests field corrections when extracted data is incomplete or inconsistent. |
| FR-04.6 | Bidirectional linking: ANVISA request stores orderId; order stores anvisaRequestId. |
| FR-04.7 | Modelo Solicitante: user profile for ANVISA requester details (name, email, RG, gender, date of birth, address, CEP, state (UF), municipality, phone, landline). State and municipality are sent to the extension separately from patient data to fill the DADOS DO SOLICITANTE section. Autofills the solicitation form. |
| FR-04.8 | Chrome extension (v1.3.5) receives OCR data via window.postMessage and auto-fills the ANVISA gov.br portal form. Handles text fields, native selects, DS Gov selects (br-select), react-select dropdowns, cascading state/city dropdowns, and file uploads. |
| FR-04.9 | Validation warns when Modelo Solicitante is not configured. |
| FR-04.10 | Search/filter by patient name: The Solicitações dashboard includes a search input that filters requests by patient display name in real time. |
| FR-04.11 | Auto-fill from database: When the system recognizes a client during the ANVISA wizard (via sales integration check), the verification form fields are auto-filled from the client's database profile. OCR-extracted data takes priority; database values are used as fallback for empty fields. |

#### **FR-05 Clients / Doctors / Representatives**

| ID | Requirement |
| :---- | :---- |
| FR-05.1 | CRUD operations for clients (patients), doctors, and sales representatives. |
| FR-05.2 | Search by name with active-only filtering. |
| FR-05.3 | Representatives can optionally be linked to a system user account. |
| FR-05.4 | Client address stored for document generation (Comprovante de Vinculo). |
| FR-05.5 | Client records include: CPF, RG, name, email, phone, birth date, full address. |
| FR-05.6 | Doctor records include: CRM number, specialty, state, city, contact info, and an optional assigned sales representative (`repUserId`). The assigned rep is the person who gets commission credit when that doctor prescribes. |
| FR-05.7 | Doctor–rep association in the wizard: When an operator selects a doctor in the Nova Venda wizard, if the doctor has an assigned rep and no rep is currently selected, the rep is auto-filled. The operator can still change the rep manually. This also applies when a doctor is matched via AI prescription extraction. |
| FR-05.8 | The doctors list page shows a "Representante" column resolved to the rep's display name (not raw UID). The doctor detail page also shows the resolved rep name. |
|  | There should be an option for admins to upload CSVs with data for several clients, doctors, or sales representatives, to add new entries in bulk |
|  | Admins should have access to sample documents to show the format for bulk upload |

#### **FR-06 Products & Inventory**

| ID | Requirement |
| :---- | :---- |
| FR-06.1 | Product catalog with: name, SKU, HS code (customs), concentration, USD price. |
| FR-06.2 | Two named stock locations: Miami (Tristar) and Brasil. Each has independent product quantities. |
|  | Inventory at Tristar in Miami may be fetched by API or may be manually updated by an admin |
| FR-06.3 | Inventory is managed via a many-to-many junction (stockProducts): each product can exist at multiple locations with different quantities. |
| FR-06.4 | Inline quantity editing per location (click quantity, edit, save). |
| FR-06.5 | Products not yet assigned to a location show a dash and an "Add" button. |
| FR-06.6 | Estoque module has 4 tabs: Miami (Tristar), Brasil, Catalogo (product CRUD), Locais de Estoque (location management). |

#### **FR-07 Shipping**

| ID | Requirement |
| :---- | :---- |
|  | The user may select between three types of shipping: Tristar Express, in-Brazil sending, and local hand-delivery.  |
| FR-07.1 | TriStar Express: Create shipments via API with flat `to_*` recipient fields and `from_*` sender fields (injected server-side from env vars). Multi-item support: each item has `shipment_item_type`, `description`, `quantity`, `unit_price`, and optional ANVISA fields for CBD products. |
| FR-07.1a | The TriStar dialog supports dynamic item management: operators can add and remove item rows. Each item has its own product type, description, quantity, and unit price. ANVISA authorization number and commercial name fields appear automatically when an item's type is set to CBD (40). |
| FR-07.2 | TriStar item types: Produtos (10), Livros (20), Medicamento (30), CBD (40), THC (41), Outro (90). |
| FR-07.3 | Track shipment status and retrieve tracking codes. |
| FR-07.4 | Generate and download shipping labels. |
| FR-07.5 | Correios (local mail): Manual entry of tracking code, carrier (Sedex/PAC), and shipping date. |
| FR-07.6 | Motoboy: Manual entry of delivery person name, phone, and estimated delivery date. |
| FR-07.7 | After shipping is confirmed, the order row is immediately hidden from the active list (local shippedIds state for instant UX feedback before Firestore updates propagate). |

#### **FR-08 Users & Access Control**

| ID | Requirement |
| :---- | :---- |
| FR-08.1 | Google OAuth authentication restricted to @entouragelab.com domain. Account picker always shown; domain enforced both client-side (sign out non-matching) and in Firestore rules. |
| FR-08.2 | Three roles: admin (full access), user (standard operations), view\_only (read-only). |
| FR-08.3 | Super-admins: caio@entouragelab.com, mario@entouragelab.com, marcos.freitas@entouragelab.com, and tiago.fonseca@entouragelab.com (hardcoded in provider and Firestore rules). Dynamic admins via roles\_admin collection. When an admin changes a user's group to/from admin, the roles\_admin collection is synced automatically. |
| FR-08.4 | Pre-registration: admins assign roles before a user's first login via preregistrations collection. |
| FR-08.5 | User management UI for admins to create, edit, and deactivate accounts. |

#### **FR-09 Checkout (Customer-Facing)**

| ID | Requirement |
| :---- | :---- |
| FR-09.1 | Customer-facing payment page  Is hosted by Global Pays. Shows order summary, products, total amount. |
| FR-09.2 | Payment confirmation page displayed after successful payment. |
| FR-09.3 | WhatsApp share button to send payment link to client. |
| FR-09.4 | QR code generation for payment link sharing. |

#### **FR-10 Dashboard**

| ID | Requirement |
| :---- | :---- |
| FR-10.1 | Dashboard page at /dashboard with overview metrics. |
| FR-10.2 | Entry point after login. |
|  | This page must show the build version being used |

#### **FR-11 Help & Documentation**

| ID | Requirement |
| :---- | :---- |
| FR-11.1 | In-app help page (/ajuda) with web application guide and Chrome extension guide. |
| FR-11.2 | Extension download link and GitHub source available from /anvisa/extensao. |

---

**FR-12 Documents**

| ID | Requirement |
| :---- | :---- |
|  | The user should be able to filter based on date range and document type |
|  | For users other than admin, this page should show the metadata for documents that the specific user has uploaded. This includes type of document, order number, sales rep, date uploaded |
|  | For admin users, this should show metadata for all documents |
|  | Each document row must display the patient name (from holder field or metadata.fullName). |
|  | Each document row must have a download button that opens the document file URL in a new tab. |

### **Nonfunctional Requirements**

#### **NFR-01 Performance**

| ID | Requirement |
| :---- | :---- |
| NFR-01.1 | Order list pages load within 2 seconds on standard broadband. |
| NFR-01.2 | PTAX exchange rate cached for 30 minutes to reduce BCB API calls. |
| NFR-01.3 | GlobalPay JWT tokens cached with 60-second refresh buffer. |
| NFR-01.4 | Real-time Firestore listeners (via useCollection hook) for all order-related pages. No polling. |
| NFR-01.5 | ANVISA pre-loads prescription data from the linked order without re-uploading or re-processing. |

#### **NFR-02 Reliability**

| ID | Requirement |
| :---- | :---- |
| NFR-02.1 | Order creation is atomic — all subcollections commit or none do. |
| NFR-02.2 | Non-critical operations (ZapSign creation, prescription upload) are non-fatal: failures are logged but do not block order creation. |
| NFR-02.3 | Webhook handlers (GlobalPay, ZapSign) are idempotent — replayed events do not corrupt state. |
| NFR-02.4 | PTAX rate lookup retries up to 7 previous days for weekends/holidays. |
| NFR-02.5 | GlobalPay auto-retries once on 401 (clears token cache and re-authenticates). |

#### **NFR-03 Security**

| ID | Requirement |
| :---- | :---- |
| NFR-03.1 | All Firestore operations require Firebase Authentication. |
| NFR-03.2 | Domain restriction: only @entouragelab.com users can access the app. Enforced by onAuthStateChanged listener; non-matching accounts are signed out immediately. |
| NFR-03.3 | Delete operations restricted to admin role in Firestore security rules. |
| NFR-03.4 | Sensitive API keys stored as Firebase App Hosting secrets, never in client code. Secrets: GOOGLE\_API\_KEY, GLOBALPAY\_API\_URL, GLOBALPAY\_PUB\_KEY, ZAPSIGN\_API\_KEY, TRISTAR\_API\_KEY. |
| NFR-03.5 | ANVISA requests: owner-or-admin access control. Users can only read/update their own requests unless they are admins. |
| NFR-03.6 | Super-admin status checked via hardcoded email list in both client code and Firestore rules. |
| NFR-03.7 | **API route authentication:** All server-side API routes enforce Firebase Authentication via a `requireAuth()` middleware that verifies the Firebase ID token from the request's Authorization header. Unauthenticated requests receive a 401 response. Admin-only routes use a `requireAdmin()` variant. |
| NFR-03.8 | **Request body validation:** All API routes that accept a request body validate it against a Zod schema via `validateBody()`. Malformed or missing fields return a 422 response with structured error details. This prevents injection of unexpected data types or missing required fields. |
| NFR-03.9 | **Webhook secret verification:** The GlobalPay webhook verifies the `X-GP-Signature` header against `GLOBALPAY_WEBHOOK_SECRET`. The ZapSign webhook verifies the `X-ZapSign-Token` header against `ZAPSIGN_WEBHOOK_TOKEN`. When these environment variables are not configured, a `console.warn` is emitted on every request to surface the misconfiguration. Invalid tokens return 401. |

#### **NFR-04 Scalability**

| ID | Requirement |
| :---- | :---- |
| NFR-04.1 | Firestore composite indexes support all query patterns without full-collection scans. 7 composite indexes currently defined. |
| NFR-04.2 | CSV import processes orders in batches of 80 to stay within Firestore's 500-operation batch limit. |
| NFR-04.3 | Firebase App Hosting with auto-scaling: 0-4 instances, 1 CPU, 512 MiB memory, 100 concurrency per instance. |

#### **NFR-05 Auditability**

| ID | Requirement |
| :---- | :---- |
| NFR-05.1 | Every document tracks createdAt, updatedAt, createdById, updatedById. |
| NFR-05.2 | Soft deletes preserve historical records. Active flags: active (products, clients, doctors, reps, users) and softDeleted (orders, ANVISA requests). |
| NFR-05.3 | Deleted ANVISA requests are archived to anvisa\_deleted\_requests (write-protected collection). |
| NFR-05.4 | **Comprehensive audit logging:** All write operations (create, update, soft-delete) on orders, clients, doctors, users, and pre-registrations are logged to the `audit_logs` collection via `writeAuditLog()`. Each log entry records: action type, target collection, document ID, `performedById` (the authenticated user who performed the action), a `changes` payload documenting what was modified, and a server-generated timestamp. |
| NFR-05.5 | **Mandatory audit context:** The `performedById` parameter is required (not optional) on all service-layer write functions. TypeScript enforces this at compile time — callers that omit the authenticated user's UID will not compile. This prevents accidental unaudited writes. |
| NFR-05.6 | **Audit trail for orders:** The orders collection — the most business-critical entity — has full audit coverage across all four write functions: `createOrder`, `updateOrderStatus`, `updateOrder`, and `updateOrderRepresentative`. Each logs the performing user and the specific changes made. |

#### **NFR-06 Usability**

| ID | Requirement |
| :---- | :---- |
| NFR-06.1 | All UI labels in Brazilian Portuguese. |
| NFR-06.2 | Responsive layout for desktop and tablet. |
| NFR-06.3 | Loading skeletons for all async data fetches. |
| NFR-06.4 | Inline error messages with toast notifications. |
| NFR-06.5 | Tooltip helpers on action buttons with delayDuration={300}. |

#### **NFR-07 Brand & Visual Identity**

| ID | Requirement |
| :---- | :---- |
| NFR-07.1 | Brand name displayed as "ENTOURAGE" with the Greek lambda character for A where applicable. |
| NFR-07.2 | Headings: Montserrat font, uppercase via font-headline \+ text-transform: uppercase. |
| NFR-07.3 | Body text: Inter font family. |
| NFR-07.4 | Background: Whispering Mist RGB(234, 234, 234\). Primary accent: Traditional Turquoise RGB(3, 145, 163\). Secondary: Teal Blue RGB(9, 61, 91\). |
| NFR-07.5 | Dark sidebar with Teal Blue background and white icon/text. |
| NFR-07.6 | Four brand icon variants: color, white (255), light gray (234), black (000). |

---

### **Integrations**

#### **INT-01 GlobalPay — Payment Processing**

| Attribute | Value |
| :---- | :---- |
| Purpose | Generate payment links for customer orders and process payment notifications via webhooks. |
| Base URL | https://api.tryglobalpays.com/v1 (configurable via GLOBALPAY\_API\_URL secret) |
| Authentication | Bearer JWT from POST /paymentapi/auth using merchant pub key \+ merchant code. Token cached with 60-second refresh buffer. Auto-retry on 401\. |
| Endpoints | POST /paymentapi/auth — obtain JWT |
|  | POST /paymentapi/order — create payment link |
|  | GET /paymentapi/order/{gpOrderId} — query transaction status |
|  | POST /paymentapi/order/{gpOrderId}/cancel — cancel transaction |
| Success code | statusCode \=== 1 (not HTTP 200 — this is a GlobalPay-specific convention) |
| Error handling | 40+ error codes mapped to Portuguese messages in the codebase |
| Webhook | POST /api/webhooks/payment — receives payment events. Parses invoice (= orderId), gpOrderId, status, amount. Approved statuses: approved, paid, completed, success. Creates payment audit record, updates order status to paid (idempotent). |
| Env vars | GLOBALPAY\_API\_URL (secret), GLOBALPAY\_PUB\_KEY (secret), GLOBALPAYS\_MERCHANT\_CODE (plain: 4912) |

#### **INT-02 ZapSign — Electronic Document Signing**

| Attribute | Value |
| :---- | :---- |
| Purpose | Generate and track e-signatures for Comprovante de Vinculo and Procuracao documents. Created during Nova Venda Step 2\. |
| Base URL | https://api.zapsign.com.br (configurable via ZAPSIGN\_API\_URL) |
| Authentication | Bearer API key in Authorization header. |
| Endpoint | POST /api/v1/docs/ — create document with signer from markdown template. |
| Document types | Comprovante de Vinculo: Signatario (name \+ CPF) declares that Cliente (name \+ CPF) resides at a given address. Procuracao: power of attorney document (when applicable). |
| Webhook | POST /api/webhooks/zapsign — receives doc\_signed events. Identifies Procuracao vs Comprovante by token match. Updates zapsignStatus or zapsignCvStatus to signed. Correlates via external\_id \= orderId. Idempotent. |
| Env vars | ZAPSIGN\_API\_URL (plain), ZAPSIGN\_API\_KEY (secret), ZAPSIGN\_SANDBOX (plain: false) |

#### **INT-03 BCB PTAX — Exchange Rates**

| Attribute | Value |
| :---- | :---- |
| Purpose | Fetch daily USD/BRL reference exchange rates from the Central Bank of Brazil for order pricing. |
| Base URL | https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/ |
| Authentication | None (public OData API). |
| Endpoint | GET CotacaoDolarDia(dataCotacao=@dataCotacao) — daily dollar quote. |
| Caching | 30-minute TTL for "today" lookups. Historical lookups bypass cache. |
| Retry | Walks back up to 7 days if rate unavailable (weekends/holidays). |
| Returns | PtaxQuote with buyRate, sellRate, midRate (calculated average), quotedAt, queryDate. |
| Env vars | None required. |

#### **INT-04 TriStar Express — Shipping & Logistics**

| Attribute | Value |
| :---- | :---- |
| Purpose | Create shipments from Miami warehouse, generate labels, and track delivery. |
| Base URL | https://sandbox.tristarexpress.com/v1/ (configurable via TRISTAR\_API\_URL). NOTE: Currently configured for sandbox. Homologation complete — shipment IDs 1825 and 1826 created successfully. Awaiting production API credentials from TriStar. |
| Authentication | Bearer API key. |
| Endpoints | POST /shipments — create shipment |
|  | GET /tracking/{shipmentId} — track status |
|  | POST /shipments/{shipmentId}/label — generate label |
|  | POST /shipments/{shipmentId}/confirm — confirm dispatch |
| Payload format | Flat field structure: `from_*` fields (sender, read from env vars server-side) and `to_*` fields (recipient, sent from dialog). Items array uses `shipment_item_type` (numeric code), `description`, `quantity`, `unit_price`. CBD items (type 40) include `anvisa_import_authorization_number` and `anvisa_product_commercial_name`. Boolean `with_insurance` flag. `integration_code` from env var. |
| Multi-item | The TriStar dialog supports multiple items per shipment. Each item has its own type, description, quantity, and unit price. ANVISA fields appear per-item when the item type is CBD (40). |
| Sender config | Static sender (Entourage Lab Miami warehouse) configured via `TRISTAR_FROM_*` environment variables. The API route reads these server-side and injects them into the TriStar payload — the client dialog never sees or sends sender data. |
| Env vars | TRISTAR\_API\_URL (plain), TRISTAR\_API\_KEY (secret), TRISTAR\_FROM\_NAME, TRISTAR\_FROM\_DOCUMENT, TRISTAR\_FROM\_ADDRESS, TRISTAR\_FROM\_NUMBER, TRISTAR\_FROM\_NEIGHBORHOOD, TRISTAR\_FROM\_CITY, TRISTAR\_FROM\_STATE, TRISTAR\_FROM\_COUNTRY, TRISTAR\_FROM\_POSTCODE, TRISTAR\_FROM\_PHONE, TRISTAR\_FROM\_EMAIL, TRISTAR\_INTEGRATION\_CODE (all plain) |

#### **INT-05 Google Gemini — AI Document Processing**

| Attribute | Value |
| :---- | :---- |
| Purpose | Classify uploaded documents and extract structured data via OCR. Used in ANVISA workflow for patient ID, proof of residence, and prescription processing. |
| SDK | @genkit-ai/google-genai (Google Genkit framework) |
| Model | googleai/gemini-2.5-flash (classification, extraction), googleai/gemini-2.5-pro (complex extraction) |
| Capabilities | Document classification (4 types: patient ID, proof of residence, procuracao, prescription), OCR field extraction with typed JSON schemas, confidence scoring, correction suggestions. |
| Cloud Function | anvisaProcessDocumentOnUpload — triggered on Firebase Storage upload. Preprocesses images (rotation, grayscale, contrast normalization, blur+sharpen, 1.5x upscale), runs OCR via Google Vision API, extracts structured fields. Region: us-central1, 300s timeout, 1GB memory. |
| Env vars | GOOGLE\_API\_KEY (secret) |

#### **INT-06 Firebase — Backend Infrastructure**

| Attribute | Value |
| :---- | :---- |
| Services | Authentication (Google OAuth), Firestore (database), Storage (file uploads), App Hosting (deployment), Cloud Functions (OCR pipeline). |
| Runtime | Node.js 20 for Cloud Functions. |
| Deployment | Firebase App Hosting with GitHub-triggered auto-deploy from main branch. Manual trigger: firebase apphosting:rollouts:create vend-backend \--git-branch main. |
| Security rules | Domain-restricted reads/writes. Admin-only deletes. Subcollection access follows parent order permissions. Super-admin defined by email check. |
| Env vars | NEXT\_PUBLIC\_FIREBASE\_API\_KEY (plain), plus 5 other NEXT\_PUBLIC\_FIREBASE\_\* client config vars. |

#### **INT-07 ANVISA Auto-Fill Chrome Extension**

| Attribute | Value |
| :---- | :---- |
| Purpose | Auto-fill the ANVISA import authorization portal form (gov.br) with OCR-extracted data from the web app. |
| Version | v1.3.5 |
| Communication | window.postMessage from web app to content script. |
| Capabilities | Text input fields (25+), native HTML selects, DS Gov br-select components, react-select dropdowns, cascading state/city dropdowns with async loading, file uploads (RG, comprovante, receita, procuracao). |
| Distribution | Manual .zip download from /extensao-anvisa.zip. Install via Chrome Developer Mode ("Load unpacked"). |
| Source | https://github.com/mario-entourage/Anvisa\_app/tree/main/extension |
| Limitation | Cannot handle CAPTCHA or bot detection on gov.br. The extension currently covers approximately 75% of form fields. Dropdown and file upload support was added in v1.3.5 but may need ongoing maintenance as the gov.br portal changes its DOM structure. |

#### **INT-08 Resend — Email Notifications**

| Attribute | Value |
| :---- | :---- |
| Purpose | Send operational email notifications for shipping events and rep alerts. |
| SDK | resend (npm package, v6.9.x) |
| Endpoint | POST /api/notifications/send-email — internal API route that creates emails via Resend API. |
| Use cases | (1) "Enviar do Brasil" notification to adm@entouragelab.com with order summary when Brazil-origin shipping is selected. (2) TriStar shipment rep notifications — when a rep-assigned order ships via TriStar, the rep receives an email with tracking code and order details. |
| Graceful degradation | If RESEND\_API\_KEY is not configured, the endpoint logs a warning and returns `{ sent: false, reason: 'no_api_key' }`. No error is thrown. |
| Env vars | RESEND\_API\_KEY (secret) |

---

## **5\. Database**

### **Technology**

Google Cloud Firestore — a serverless, horizontally-scaled NoSQL document database. Data is organized into collections of documents, with support for nested subcollections.

### **Design Principles**

| Principle | Implementation |
| :---- | :---- |
| Single primary key | Every order and its prescription share the same Firestore document ID (the Receita ID). One key identifies the order across every collection and subcollection. |
| Denormalized subcollections | Order-scoped data (customer, doctor, products, payments) lives in subcollections under the order document. This is the canonical Firestore pattern — fast reads, atomic writes, simple security rules. |
| Atomic batch writes | The entire order tree (root \+ 8 subcollections) is created in a single writeBatch commit. All-or-nothing. |
| Soft deletes | Records use active / softDeleted flags rather than physical deletion. Preserves audit trails for regulatory compliance. |
| Timestamp bookkeeping | Every document: createdAt, updatedAt (server timestamps). Many also track createdById, updatedById (auth UIDs). |
| Composite indexes | All list views that filter \+ sort have declared composite indexes, keeping queries O(log n). |
| Namespace separation | ANVISA collections prefixed with anvisa\_ to avoid collisions with sales module. |

### **Collections**

#### **orders/{receitaId} — Central collection**

Each document represents one sales order. Document ID \= Receita ID \= prescription ID.

| Field | Type | Description |
| :---- | :---- | :---- |
| status | OrderStatus | pending, processing, awaiting\_documents, documents\_complete, awaiting\_payment, paid, shipped, delivered, cancelled |
| type | OrderType | sale, return, exchange |
| invoice | string | Invoice / payment reference number |
| currency | string | BRL or USD |
| amount | number | Total order value |
| discount | number | Discount percentage |
| exchangeRate | number? | PTAX midpoint rate at order creation |
| exchangeRateDate | string? | Date rate was quoted (YYYY-MM-DD) |
| legalGuardian | boolean | Whether order is placed by a legal guardian |
| anvisaOption | AnvisaOption? | regular, exceptional, exempt |
| anvisaStatus | string? | ANVISA request status |
| anvisaRequestId | string? | FK to anvisa\_requests |
| zapsignDocId | string? | ZapSign Procuracao document token |
| zapsignStatus | string? | Procuracao signing status |
| zapsignSignUrl | string? | Procuracao signing URL |
| zapsignCvDocId | string? | ZapSign Comprovante de Vinculo token |
| zapsignCvStatus | string? | Comprovante signing status |
| zapsignCvSignUrl | string? | Comprovante signing URL |
| allowedPaymentMethods | object? | { creditCard, debitCard, boleto, pix } boolean flags |
| frete | number? | Shipping cost (BRL) |
| documentsComplete | boolean | All required documents received |
| prescriptionDocId | string? | Firebase Storage path to prescription |
| tristarShipmentId | string? | TriStar shipment reference |
| softDeleted | boolean? | Soft-delete flag |
| createdById | string | Auth UID of creator |
| updatedById | string? | Auth UID of last updater |
| createdAt | Timestamp | Server timestamp |
| updatedAt | Timestamp | Server timestamp |
| batchImportId | string? | CSV import deduplication key |
| codigoRastreio | string? | Tracking code |
| statusEnvio | string? | Shipping status |
| formaEnvio | string? | Shipping carrier / method |
| dataEnvio | string? | Ship date |
| previsaoEntrega | string? | Estimated delivery date |
| lote | string? | Batch number |
| lead | string? | Lead type (first purchase, repurchase) |
| dataOrcamento | string? | Quote date |
| statusOrcamento | string? | Quote status |
| meioPagamento | string? | Payment method used |
| invoiceCorrecao | string? | Correction invoice number |

Subcollections of orders/{receitaId}:

| Subcollection | Cardinality | Contents |
| :---- | :---- | :---- |
| customer | 1 doc | Patient name, CPF, linked userId |
| representative | 1 doc | Sales rep name, linked userId |
| doctor | 1 doc | Doctor name, CRM, linked userId |
| products | N docs | Line items: stockProductId, productName, quantity, price, discount |
| shipping | 0-1 doc | Address, tracking, carrier info, TriStar fields |
| documentRequests | N docs | Required document checklist: type, status, receivedAt |
| payments | N docs | Payment records: provider, amount, status |
| paymentLinks | N docs | GlobalPay links: URL, amount, expiry, secretKey |

Indexes: (status ASC, createdAt DESC), (createdById ASC, createdAt DESC)

---

#### **prescriptions/{receitaId} — 1:1 with orders**

Same document ID as the order.

| Field | Type | Description |
| :---- | :---- | :---- |
| prescriptionDate | string? | Date from physical prescription |
| uploadDate | string | ISO 8601 upload timestamp |
| clientId | string | FK to clients |
| doctorId | string | FK to doctors |
| orderId | string | Same as document ID |
| prescriptionPath | string | Firebase Storage path |
| products | array | { productId, productName, quantity, negotiatedTotalPrice } |
| createdAt | Timestamp | Server timestamp |

---

#### **clients/{clientId}**

| Field | Type | Description |
| :---- | :---- | :---- |
| document | string | CPF or CNPJ |
| rg | string? | Identity document number |
| firstName, lastName, fullName | string | Name parts \+ denormalized full name |
| email, phone | string? | Contact |
| birthDate | Timestamp? | Date of birth |
| address | object? | { postalCode, street, number, complement, neighborhood, city, state, country } |
| active | boolean | Soft-delete flag |
| createdAt, updatedAt | Timestamp | Bookkeeping |

Index: (active ASC, fullName ASC)

---

#### **doctors/{doctorId}**

| Field | Type | Description |
| :---- | :---- | :---- |
| firstName, lastName, fullName | string | Name |
| crm | string | Medical license number |
| mainSpecialty | string? | Specialty |
| state, city | string? | Registration location |
| email, phone, mobilePhone | string? | Contact |
| repUserId | string? | Optional FK to representantes — the sales rep assigned to this doctor for commission credit |
| active | boolean | Soft-delete flag |
| createdAt, updatedAt | Timestamp | Bookkeeping |

Index: (active ASC, fullName ASC)

---

#### **representantes/{representanteId}**

| Field | Type | Description |
| :---- | :---- | :---- |
| name | string | Full name |
| email, phone | string? | Contact |
| estado | string? | State (UF) |
| userId | string? | Optional FK to users |
| active | boolean | Soft-delete flag |
| createdAt, updatedAt | Timestamp | Bookkeeping |

Index: (active ASC, name ASC)

---

#### **products/{productId}**

| Field | Type | Description |
| :---- | :---- | :---- |
| name | string | Product name |
| description | string? | Description |
| sku | string | Stock keeping unit |
| hsCode | string | Harmonized system code (customs) |
| concentration | string? | For pharmaceutical products |
| price | number | Unit price (USD) |
| inventory | number? | Legacy stock count |
| active | boolean | Soft-delete flag |
| createdAt, updatedAt | Timestamp | Bookkeeping |

Index: (active ASC, name ASC)

---

#### **stocks/{stockId} and stockProducts/{stockProductId}**

Many-to-many junction for product-to-location inventory.

* stocks: { code, name, description, createdAt, updatedAt }  
* stockProducts: { stockId, productId, quantity, createdAt, updatedAt }

Two named locations expected: "Miami (Tristar)" and "Brasil".

---

#### **users/{uid}**

Document ID \= Firebase Auth UID.

| Field | Type | Description |
| :---- | :---- | :---- |
| email | string | Google OAuth email |
| groupId | string | Role: admin, user, view\_only |
| active | boolean | Account active |
| lastLogin | Timestamp | Last sign-in |
| createdAt, updatedAt | Timestamp | Bookkeeping |

Index: (active ASC, email ASC)

---

#### **preregistrations/{encodedEmail}**

Pre-register users before first login. Document ID \= email with @ and . replaced by \_.

| Field | Type | Description |
| :---- | :---- | :---- |
| email | string | User email |
| groupId | string | Role to assign |
| createdAt | Timestamp | When pre-registered |

---

#### **documents/{documentId}**

Global registry of uploaded documents.

| Field | Type | Description |
| :---- | :---- | :---- |
| type | string | Document type |
| holder | string | Document holder name |
| key, number | string | Reference keys |
| metadata | object | Additional data |
| userId, orderId | string? | Foreign keys |
| createdAt, updatedAt | Timestamp | Bookkeeping |

---

#### **ANVISA Module Collections**

Prefixed with anvisa\_ for namespace isolation.

| Collection | Purpose |
| :---- | :---- |
| anvisa\_requests/{requestId} | Authorization requests with status, document references, confirmation number, orderId FK |
| anvisa\_userProfiles/{userId} | Modelo Solicitante — requester profiles for form autofill |
| anvisa\_defaultProfile/{docId} | Default profile template |
| anvisa\_deleted\_requests/{requestId} | Audit trail of soft-deleted requests |
| anvisa\_roles\_admin/{userId} | ANVISA module admin roles |

Each request has subcollections: pacienteDocuments, procuracaoDocuments, comprovanteResidenciaDocuments, receitaMedicaDocuments.

---

#### **audit\_logs/{logId} — Audit trail**

Every write operation (create, update, soft-delete) on business-critical collections is logged here.

| Field | Type | Description |
| :---- | :---- | :---- |
| action | string | create, update, soft\_delete, update\_representative, update\_status |
| collection | string | Target collection name (orders, clients, doctors, users, preregistrations) |
| documentId | string | ID of the affected document |
| performedById | string | Firebase Auth UID of the user who performed the action |
| changes | object | Key-value map of what was changed |
| timestamp | Timestamp | Server-generated timestamp |

---

#### **Supporting Collections**

| Collection | Purpose |
| :---- | :---- |
| roles\_admin/{userId} | Dynamic admin role assignments |
| exchangeQuotes/{quoteId} | Currency exchange quotes for payments |
| paymentMethods/{paymentMethodId} | Payment method configurations and installment plans |
| medicalSpecialties/{specialtyId} | Lookup table for doctor specialties |

---

### **Entity Relationships**

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

## **6\. Risks**

### **Technical Risks**

| Risk | Severity | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| ANVISA portal DOM changes | High | High | The Chrome extension relies on specific CSS selectors and DOM structure of the gov.br ANVISA portal. Any redesign of the portal will break the extension. There is no API alternative — ANVISA only offers a web form. Monitor the portal for changes; maintain a test suite of expected selectors. |
| GlobalPay API instability | Medium | Medium | GlobalPay uses non-standard conventions (statusCode \=== 1 for success, custom error codes). Documentation is sparse. The integration has 40+ error code mappings that were reverse-engineered. New error codes may appear without notice. |
| TriStar API in sandbox mode | Medium | Certain | The TriStar API URL is currently set to sandbox. Homologation testing is complete (shipment IDs 1825 and 1826 created successfully with multi-item payloads). The payload format has been corrected to match the actual API specification (flat `from_*`/`to_*` fields, `shipment_item_type`, `unit_price`, `description`). Production migration requires: (1) receiving production API credentials from TriStar, (2) updating `TRISTAR_API_URL` and `TRISTAR_API_KEY` env vars, (3) validating one test shipment in production. The inventory sync endpoint is not yet known. |
| Firestore batch write limits | Low | Low | Firestore limits batch writes to 500 operations. CSV import chunks at 80 rows to stay safe. If order subcollections grow significantly, single-order creation could approach limits. Currently well within bounds. |
| AI OCR accuracy | Medium | Medium | Gemini OCR extraction depends on image quality. Poor scans, handwritten prescriptions, or unusual formats may produce incorrect field values. The system shows confidence scores and allows manual correction, but operators must verify. |
| Exchange rate timing | Low | Low | PTAX rates are fetched at order creation time and stored with the order. If there is a significant delay between order creation and payment, the rate used may differ from the actual rate at payment time. Currently mitigated by the 30-minute cache and the fact that most payments happen within 24 hours. |

### **Regulatory Risks**

| Risk | Severity | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| ANVISA process changes | High | Medium | ANVISA may change their import authorization process, required documents, or form fields at any time. The current system is tightly coupled to the existing ANVISA workflow. Any regulatory changes require both code and extension updates. |
| Patient data privacy (LGPD) | High | Low | The platform stores sensitive patient data (CPF, RG, medical prescriptions, health conditions). Brazil's LGPD (General Data Protection Law) requires explicit consent, data minimization, and breach notification. Current implementation stores data in Firestore with domain-restricted access, but there is no explicit LGPD consent workflow or data retention policy. |
| Cross-border payment compliance | Medium | Low | USD-to-BRL transactions through GlobalPay must comply with Brazilian Central Bank regulations. The platform stores exchange rates for audit purposes, but compliance is primarily GlobalPay's responsibility. |

### **Operational Risks**

| Risk | Severity | Likelihood | Mitigation |
| :---- | :---- | :---- | :---- |
| Key person dependency | High | Certain | The platform was built by a single developer. Knowledge transfer via this document and inline code comments. All secrets are managed via Firebase App Hosting secrets (not in code). |
| Chrome extension distribution | Medium | Medium | The extension is distributed as a manual .zip download, not through the Chrome Web Store. This means no automatic updates — users must manually download and reinstall new versions. Consider Chrome Web Store publication for automatic updates. |
| Firebase vendor lock-in | Medium | Low | The entire backend is Firebase (Auth, Firestore, Storage, Functions, Hosting). Migration to another provider would require rewriting the data layer, authentication, and deployment pipeline. This is acceptable for the current scale. |

---

## **7\. Constraints**

### **Technical Constraints**

| Constraint | Impact |
| :---- | :---- |
| Firebase App Hosting | Deployment is tied to GitHub repo venda-integracao on branch main. Auto-deploys on push. Backend name: vend-backend. Max 4 instances, 512 MiB memory each. |
| Firestore (NoSQL) | No joins, no transactions across collections (batches are within a single commit). Denormalization is required. Queries require pre-declared composite indexes. |
| Google OAuth only | No username/password authentication. All users must have @entouragelab.com Google Workspace accounts. |
| Server-side API keys | All external API calls (GlobalPay, ZapSign, TriStar, Gemini) must go through Next.js API routes or Cloud Functions — never from the browser client. |
| Firestore security rules | Rules are declarative and cannot call external services. Complex authorization logic must be duplicated between client-side code and rules. |
| Chrome extension (Manifest V3) | Content scripts run in page context. Service workers replace background pages. No eval() or remote code loading. |
| TriStar sandbox | Currently pointed at sandbox URL. Production migration requires URL change and testing. |
| Cloud Functions region | Functions deployed to us-central1. Must match Firestore region for low-latency triggers. |

### **Resource Constraints**

| Constraint | Impact |
| :---- | :---- |
| Small team | 1-3 operators use the platform. Features should prioritize reliability over scale. |
| Budget | Firebase Blaze plan (pay-as-you-go). Genkit AI calls have per-request costs. Minimize unnecessary AI processing. |
| No staging environment | Currently no separate staging/dev Firebase project. All testing happens against production data (with soft deletes as a safety net). Consider creating a staging project for the new developer. |

### **Business Constraints**

| Constraint | Impact |
| :---- | :---- |
| Brazilian regulatory compliance | All patient-facing documents must comply with ANVISA requirements. CPF validation is mandatory. Prescriptions must be stored for regulatory audit. |
| Portuguese language | All UI must be in Brazilian Portuguese. Error messages, labels, status names — everything the operator sees. |
| WhatsApp-centric communication | Clients are contacted via WhatsApp, not email. All "send to client" actions generate WhatsApp deep links. |
| USD pricing, BRL payment | Products are priced in USD, but patients pay in BRL. PTAX exchange rate conversion is mandatory for every order. |

---

## **8\. Future**

### **Planned Features**

| Feature | Priority | Description |
| :---- | :---- | :---- |
| TriStar inventory sync | High | Implement real-time or daily inventory sync between the platform and TriStar Express warehouse in Miami. A placeholder API route exists at /api/tristar/inventory/route.ts. The TriStar inventory API endpoint is not yet documented — research required. |
| TriStar production migration | High | Switch TRISTAR\_API\_URL from sandbox to production (https://api.tristarexpress.com/v1/). Validate all shipment creation, tracking, and label flows against real shipments. |
| Enhanced ANVISA automation | High | The Chrome extension currently handles approximately 75% of ANVISA form fields. Remaining gaps include some dropdown menus and file uploads on the gov.br portal. Options explored: (1) Enhanced Chrome Extension (recommended — lowest cost, leverages existing architecture), (2) Selenium/Playwright server-side automation (higher cost, maintenance burden, bot detection risk), (3) Hybrid approach. |
| Staging environment | Medium | Create a separate Firebase project for development/staging with isolated Firestore, Auth, and Storage. Currently all development tests against production. |
| LGPD compliance | Medium | Implement explicit consent workflow for patient data, data retention policies, right-to-deletion support, and breach notification procedures. |
| Chrome Web Store publication | Medium | Publish the ANVISA extension to the Chrome Web Store for automatic updates instead of manual .zip distribution. |
| Automated testing | Medium | The project has 113 unit tests covering order status logic, BCB PTAX, GlobalPay, ZapSign, and webhook handlers (~300ms total runtime). Remaining gaps: Firestore integration tests (Firebase Emulator), E2E smoke tests (Playwright), Chrome extension regression tests, AI/OCR accuracy tests. |
| Notification system | Low | Partially implemented: email notifications via Resend for "Enviar do Brasil" (admin alert) and TriStar shipment rep notifications. Remaining: push notifications or email alerts for payment received, document signed, ANVISA approved. |
| Reporting & analytics | Low | Dashboard with sales metrics, conversion rates, average processing time, revenue by representative. Currently the Dashboard page is minimal. |
| Multi-language support | Low | English UI option for Miami-based operators. Currently hardcoded Portuguese only. |

### **Architecture Recommendations for New Developer**

1. Read the codebase in this order: src/types/ (data shapes) → src/services/ (data operations) → src/lib/ (business logic) → src/app/api/ (API routes) → src/components/ (UI) → src/app/(app)/ (pages).  
2. Key patterns to understand:  
   * useCollection\<T\>(query) — real-time Firestore subscription hook. Used everywhere for live data.  
   * useMemoFirebase(() \=\> query, \[deps\]) — memoized Firestore query builder. Prevents re-subscription on every render.  
   * useFirebase() — context provider for firestore, user, isAdmin. Available in all (app) pages.  
   * Atomic order creation in orders.service.ts — the createOrder function is the most complex write in the system.  
3. Environment setup:  
   * Copy .env values from apphosting.yaml (non-secret values are plaintext there).  
   * Secrets must be retrieved from Firebase: firebase apphosting:secrets:access \<NAME\>.  
   * Install dependencies: npm install.  
   * Run dev server: npm run dev.  
   * Deploy: push to main branch (auto-deploy) or firebase apphosting:rollouts:create vend-backend \--git-branch main.  
4. Known technical debt:  
   * Some order fields are legacy from CSV import and are not used by the wizard (invoiceCorrecao, statusOrcamento, dataOrcamento, lead, lote).  
   * The zapsignDocId / zapsignStatus / zapsignSignUrl fields are marked as legacy — new orders use Comprovante de Vinculo (zapsignCvDocId) but the old Procuracao fields are still read for backward compatibility.  
   * The inventory field on products is legacy — inventory is now tracked via the stockProducts junction table.  
   * Super-admin emails are hardcoded in both TypeScript and Firestore rules. Adding a new super-admin requires code changes.

---

## **Appendix: Navigation Map**

```
/dashboard          Dashboard (entry point after login)
/remessas           Nova Venda (5-step wizard, or ?resume={id} for resumption)
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

## **Appendix: Environment Variables**

| Variable | Source | Description |
| :---- | :---- | :---- |
| NEXT\_PUBLIC\_FIREBASE\_API\_KEY | Plain | Firebase client API key |
| NEXT\_PUBLIC\_APP\_NAME | Plain | "Entourage Lab" |
| NEXT\_PUBLIC\_APP\_URL | Plain | https://app.entouragelab.com |
| PAYMENT\_LINK\_EXPIRATION\_HOURS | Plain | 24 |
| GLOBALPAYS\_MERCHANT\_CODE | Plain | 4912 |
| GOOGLE\_API\_KEY | Secret | Google AI (Gemini) API key |
| GLOBALPAY\_API\_URL | Secret | GlobalPay base URL |
| GLOBALPAY\_PUB\_KEY | Secret | GlobalPay public key for auth |
| ZAPSIGN\_API\_URL | Plain | https://api.zapsign.com.br |
| ZAPSIGN\_SANDBOX | Plain | false |
| ZAPSIGN\_API\_KEY | Secret | ZapSign API key |
| TRISTAR\_API\_URL | Plain | https://sandbox.tristarexpress.com/v1/ |
| TRISTAR\_API\_KEY | Secret | TriStar Express API key |
| TRISTAR\_FROM\_NAME | Plain | Sender name (Entourage Lab) |
| TRISTAR\_FROM\_DOCUMENT | Plain | Sender document/tax ID |
| TRISTAR\_FROM\_ADDRESS | Plain | Sender street address |
| TRISTAR\_FROM\_NUMBER | Plain | Sender address number |
| TRISTAR\_FROM\_NEIGHBORHOOD | Plain | Sender neighborhood |
| TRISTAR\_FROM\_CITY | Plain | Sender city (Miami) |
| TRISTAR\_FROM\_STATE | Plain | Sender state (FL) |
| TRISTAR\_FROM\_COUNTRY | Plain | Sender country (US) |
| TRISTAR\_FROM\_POSTCODE | Plain | Sender postal code |
| TRISTAR\_FROM\_PHONE | Plain | Sender phone number |
| TRISTAR\_FROM\_EMAIL | Plain | Sender email (logistics@entouragelab.com) |
| TRISTAR\_INTEGRATION\_CODE | Plain | TriStar integration identifier (default: 1) |
| GLOBALPAY\_WEBHOOK\_SECRET | Secret | GlobalPay webhook signature verification token |
| ZAPSIGN\_WEBHOOK\_TOKEN | Secret | ZapSign webhook token verification |
| RESEND\_API\_KEY | Secret | Resend email API key (for shipping notifications) |

## **Appendix: Tech Stack**

| Layer | Technology | Version |
| :---- | :---- | :---- |
| Framework | Next.js (App Router) | 15.5.10 |
| UI Library | React | 19.1.0 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui (Radix primitives) | Latest |
| Icons | Lucide React | Latest |
| Forms | React Hook Form \+ Zod | Latest |
| Database | Firebase Firestore | 11.10.0 (client SDK) |
| Auth | Firebase Authentication | Google OAuth |
| Storage | Firebase Storage | File uploads |
| Hosting | Firebase App Hosting | Auto-scaling |
| Cloud Functions | Firebase Functions | Node.js 20 |
| AI | Google Genkit \+ Gemini | 1.29.0 |
| Package Manager | npm | Latest |

---

*This document was prepared for developer handoff. For questions, contact the Entourage Lab engineering team.*

