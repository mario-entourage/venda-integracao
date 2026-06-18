# Change Request Triage
Last updated: 2026-06-18

## Master List

Items 1–31 are from RTM_Entourage.xlsx (Tricia Grisi, last modified 2026-03-26). Items 32+ capture work shipped after that triage (see "Shipped Since the Original Triage" below).

| # | Title | Status |
|---|-------|--------|
| 1 | TriStar Inventory Sync | Obsolete — TriStar removed; superseded by #34 (Memphis) |
| 2 | TriStar Production Migration | Obsolete — TriStar removed; superseded by #34 (Memphis) |
| 3 | Enhanced ANVISA Automation | Open |
| 4 | Staging Environment | Open — was tied to #2; still no staging env |
| 5 | LGPD Compliance | Open |
| 6 | Chrome Web Store Publication | Open — blocked on extension readiness |
| 7 | Automated Testing | Open |
| 8 | Notification System | Open |
| 9 | Reporting & Analytics | Open |
| 10 | Multi-Language Support | Open |
| 11 | Legacy Order Fields Cleanup | Open — awaiting PM confirmation |
| 12 | Legacy ZapSign Fields Cleanup | Rejected |
| 13 | Legacy Inventory Field Cleanup | Open — awaiting PM confirmation |
| 14 | Configurable Super-Admin Roles | Fixed (this PR) |
| 15 | Order Confirmation Page | Already shipped |
| 16 | Filter and Sorting Feature | Largely shipped (DataTable search/sort/pagination across lists) |
| 17 | Enable Manual Field Entry/Override | Open |
| 18 | Create Payment Link (no order required) | Already shipped |
| 19 | Bulk Document Upload via Drag-and-Drop | Already shipped |
| 20 | Prescription Quantity Exceeded Alert | Already shipped |
| 21 | GlobalPay Sandbox / Payment Synchronization | Shipped — GlobalPay active (removed then restored); verify/sync routes + webhook live |
| 22 | Prescription Expiration Alerts | Already shipped |
| 23 | Document Download for Offline Access | Already shipped |
| 24 | Fix ANVISA Request Status Filter | Fixed (this PR) |
| 25 | Resolve Navigation Issue on Requests Page | Fixed (this PR) |
| 26 | Improve Shipping Field Placement and Calculation | Shipped — frete below subtotal, included in totals |
| 27 | Stabilize Document Type Auto-Recognition | Fixed |
| 28 | Add Address Field to Customer Profile | Already shipped |
| 29 | Fix ANVISA / Gov.br Integration Autofill | Open |
| 30 | Enhance Document Search and Customer Data Copying | Partial — Documentos search shipped; one-click copy in Clientes still open |
| 31 | *(no description)* | Needs definition |
| 32 | External Sales Reps (no login) | Shipped |
| 33 | Designate Rep without Login (pending-user toggle + login merge) | Shipped |
| 34 | Memphis (Licons) Shipping Integration | Open — not yet built (replaces removed TriStar) |
| 35 | CSV Bulk Import — UTF-8 + header requirement | Shipped |
| 36 | Production Build Outage Postmortem (PageHeader children) | Fixed |

---

## Rejected

| # | Request | Reason |
|---|---------|--------|
| 12 | Legacy ZapSign Fields Cleanup (`zapsignDocId`, `zapsignStatus`, `zapsignSignUrl`) | Fields are actively used in the ZapSign webhook (routes Procuração signing events), order status helpers (gates completion), wizard steps (writes on doc creation), order checklist, and `orders.service.ts`. Removing them breaks Procuração signing. |

---

## Already Shipped — Close These

The following change requests describe features that are already implemented and live. No work is needed.

| # | Request | Where It Lives | Notes |
|---|---------|---------------|-------|
| 15 | Order Confirmation Page | `src/components/vendas/step-order-confirmation.tsx` and `step-payment-confirmation.tsx` | Both confirmation steps are wired into the wizard as steps 1 and 3. Includes "Copiar Resumo" copy action. |
| 18 | Create Payment Link (no order required) | `src/app/(app)/pagamentos/page.tsx` | "Avulso" link creation is available in the Pagamentos screen. Invoice format: `ETGM#####`. |
| 19 | Bulk Document Upload via Drag-and-Drop | `src/components/vendas/step-documentacao.tsx` | `useDropzone` is already integrated. Users can drag files directly onto the upload zone. |
| 20 | Prescription Quantity Exceeded Alert | `src/components/vendas/step-identificacao.tsx` (lines 808–815) | Shows a toast and an amber border when the requested quantity exceeds the prescription. |
| 22 | Prescription Expiration Alert | `src/components/vendas/step-identificacao.tsx` (lines 163–173) | Shows a warning when the prescription is older than 5 months. |
| 23 | Document Download for Offline Access | `src/app/(app)/documentos/page.tsx` (lines 298–299) | Download button is present on every document row in the Documentos list. |
| 28 | Add Address Field to Customer Profile | `src/app/(app)/clientes/[id]/page.tsx` + `src/components/forms/customer-form.tsx` | Address is displayed read-only when present (lines 170–184). Edit form has a collapsible address section via `<AddressForm>`. `handleSave` writes `address` to Firestore via `updateClient`. Fully implemented. |

---

## Fixed

### Item 14 — Configurable Super-Admin Roles (`firestore.rules` + `src/firebase/provider.tsx`)

**Request:** Replace hardcoded super-admin email checks with configurable role management.

**Root cause.** Super-admin identity was hardcoded in two places: a `SUPER_ADMIN_EMAILS` constant in `provider.tsx` and an inline email array in `firestore.rules`. Adding or removing a super-admin required a code change and a full deploy.

**Fixed.** Super-admin emails are now stored in a `config/superAdmins` Firestore document (`{ emails: string[] }`). The `isSuperAdmin()` Firestore rule function reads from this document. The client provider subscribes via `onSnapshot` so the app reflects changes without a reload. The `config` collection is readable by all authenticated users and writable only by existing super-admins — preventing privilege escalation via the `roles_admin` collection.

**Bootstrap note.** The `config/superAdmins` document must be created via the Firebase Admin SDK before deploying these rules. There is no UI for managing it — use the Firebase Console or a one-off Admin SDK script.

**Files changed:** `firestore.rules`, `src/firebase/provider.tsx`.

---

### Items 24 & 25 — ANVISA Filter and Empty Tabs (`dashboard-components.tsx`)

Two separate bugs in the same component.

**Item 24 — Status filter is decorative.**
The "Filtrar" dropdown renders `<DropdownMenuItem>Status</DropdownMenuItem>` but clicking it does nothing — no `onClick`, no state. The `filteredRequests` filter (line 79) only checks `patientDisplayName`. There is no `statusFilter` state anywhere in the component.

**Item 25 — Three tabs render blank content.**
`<Tabs defaultValue="all">` has four `TabsTrigger`s ("Todas", "Ativas", "Rascunho", "Arquivadas") but only one `TabsContent` (`value="all"`). Clicking "Ativas", "Rascunho", or "Arquivadas" shows a completely empty page — no rows, no empty state, no message. This is the "navigation issue": users click a tab and see nothing, think the page or their session is broken.

**Fixed.** Tabs are now controlled (`activeTab` state). The decorative filter dropdown was removed. The Card table sits directly inside `<Tabs>` (no `TabsContent`) and `filteredRequests` incorporates the tab filter:
- "Todas" → all statuses
- "Ativas" → EM_AJUSTE, EM_AUTOMACAO, ERRO (in-flight only)
- "Rascunho" → PENDENTE (submitted, not yet picked up)
- "Arquivadas" → CONCLUIDO

Page resets to 0 on tab or search change. CSV export and select-all both respect the active tab filter.

---

### Item 27 — Document Type Auto-Recognition Latency

**Root cause identified.** The classification pipeline is:
1. Client converts file to base64 in-browser (`fileToBase64`)
2. POST to `/api/ai/classify-document` with the full base64 payload
3. API calls `classifyDocumentFlow` (Genkit) → `ai.generate()` with a multimodal vision prompt
4. Response JSON is parsed and validated against `VALID_TYPES`

The latency is inherent to the LLM vision call — there is no caching, no fast-path for known file names, and the entire base64 image is sent on every upload. The 60-second timeout (set in the `authFetch` call) is generous, but slow network + large image + cold model = frequent timeouts, which silently fall back to `'general'`.

**What "stabilize" means in practice:**
- Timeouts → silent `'general'` fallback (user sees wrong type, no feedback)
- The model occasionally returns markdown around the JSON; the `jsonStart`/`jsonEnd` extraction handles this, but is fragile if the model wraps in a code block

**Fixed (Option A).** The `catch` block in `handleFileReady` now checks `err instanceof DOMException && err.name === 'AbortError'`. On timeout, shows a toast: "Tipo não reconhecido — A classificação demorou muito. Selecione o tipo manualmente." All other failures show: "Não foi possível classificar o documento. Selecione o tipo manualmente." Both paths fall back to `'general'`. `src/app/(app)/controle/[orderId]/page.tsx`.

---

## Open — Awaiting PM Input

| # | Request | Question |
|---|---------|----------|
| 11 | Legacy Order Fields Cleanup — remove `invoiceCorrecao`, `statusOrcamento`, `dataOrcamento`, `lead`, `lote` | Confirm these fields are not written or read anywhere in current workflows (CSV import, external integrations, reporting). |
| 13 | Legacy Inventory Field Cleanup — remove `products.inventory` | Confirm `stockProducts` junction table is the sole source of truth for inventory and `products.inventory` is never written or read. |
| 31 | *(no description)* | Needs a title and description before it can be triaged. |

> **Item 21 (GlobalPay) resolved.** GlobalPay was temporarily removed and then restored; it is now active in production — `src/server/integrations/globalpay.ts` (auth/order/query/cancel + token caching), `src/app/api/payments/{verify-link,sync,update-link}/route.ts`, the `src/app/api/webhooks/payment/route.ts` webhook, and "Sincronizar GlobalPay" in the Pagamentos / Controle screens. No PM clarification outstanding.

---

## Open — Ready to Scope

| # | Request | Description | Est. size |
|---|---------|-------------|-----------|
| 3 | Enhanced ANVISA Automation | Increase ANVISA extension automation coverage beyond ~75% by closing remaining dropdown and file upload gaps. | L |
| 5 | LGPD Compliance | Explicit consent workflow, data retention policy, right-to-deletion support, and breach notification procedures. | XL |
| 7 | Automated Testing | Unit tests for business logic and integration tests for API routes (webhooks, payment flows). | M |
| 8 | Notification System | Push or email notifications when orders change status — payment confirmed, document signed, ANVISA approved. | M |
| 9 | Reporting & Analytics | Dashboard metrics: sales totals, conversion rates, average processing time, revenue by representative. | L |
| 10 | Multi-Language Support | English UI option for Miami-based operators. | L |
| 17 | Enable Manual Field Entry/Override | Manual entry or override for every auto-filled field across all relevant pages. | M |
| 29 | Fix ANVISA / Gov.br Integration Autofill | Ensure phone, email, and physician data are correctly auto-filled in the ANVISA/Gov.br form. Investigate potential certificate or API integration issue. | M |
| 30 | Enhance Document Search and Customer Data Copying | **Remaining half only:** one-click copy of customer information in the Clientes detail screen. (Search-by-customer-name in Documentos is already shipped via `src/lib/document-helpers.ts`.) | S |

---

## Open — Blocked on External

| # | Request | Blocker |
|---|---------|---------|
| 6 | Chrome Web Store Publication | Requires the ANVISA Chrome extension to be stable and approved for public distribution. |

---

## Obsolete — TriStar Removed

The TriStar Express shipping integration was **removed** from the codebase (no `src/app/api/tristar/` route, no TriStar dialog; `ShippingMethod = 'LOCAL_MAIL' | 'MOTOBOY' | 'OTHER'`). The international-carrier replacement is **Memphis** (on the Licons platform), tracked as #34 and **not yet built**. The following items are therefore obsolete as written:

| # | Request | Disposition |
|---|---------|-------------|
| 1 | TriStar Inventory Sync | Obsolete. Re-scope against Memphis if/when that integration lands (#34). |
| 2 | TriStar Production Migration | Obsolete. TriStar code was removed, not pending credentials. |
| 4 | Staging Environment | Still open as an independent need — no staging env exists — but no longer tied to the TriStar migration. |

---

## Shipped Since the Original Triage

Work completed after the 2026-03-26 RTM snapshot.

| # | Item | Where it lives |
|---|------|----------------|
| 16 | Filter and Sorting | `src/components/shared/data-table.tsx` — search + sortable columns + pagination across list pages (clientes, documentos, controle, etc.). |
| 21 | GlobalPay restored & active | `src/server/integrations/globalpay.ts`, `src/app/api/payments/*`, `src/app/api/webhooks/payment/route.ts`. |
| 26 | Shipping field placement & calculation | Frete sits below the products subtotal and is included in the grand total across `step-identificacao.tsx` and `step-order-confirmation.tsx`. |
| 32 | External sales reps (no login) | `POST /api/admin/external-reps` creates a `users` doc with `external: true, isRepresentante: true`; UI at `/representantes → Externo`. |
| 33 | Designate rep without login | `/usuarios` Representante toggle now works for `Pendente` users via `POST /api/admin/activate-rep`; on first login, `ensureUser` merges the duplicate rep doc into the UID account (`mergedIntoUid`) and the commissions API follows the pointer. Requires the `firestore.rules` same-email-update clause (deployed). |
| 35 | CSV bulk import — UTF-8 + header | `/importar` states the requirement; PapaParse uses `header: true`. Non-UTF-8 (e.g. Mac Roman) makes every row fail "Nome/CRM obrigatório". |
| 36 | Production build outage postmortem | App Hosting builds failed for ~2 months (mid-Apr → mid-Jun) due to a `PageHeader` that didn't accept `children` (used by the api-keys and representantes pages). Fixed by adding a `children` prop (`src/components/shared/page-header.tsx`). **Follow-up:** add a required CI build check on PRs so a non-building `main` can't recur (relates to #7). |

---

## Open — Pending / Not Built

| # | Request | Status |
|---|---------|--------|
| 34 | Memphis (Licons) shipping integration | Vendor Q&A received (webhooks, auth, environments, no API versioning); endpoints/payload still to be mapped from the Postman collection. Placeholder route `src/app/api/external/v1/logistics/route.ts`. Not yet built. See requirements INT-09. |
