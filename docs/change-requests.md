# Change Request Triage
Last updated: 2026-03-26

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
| 2 | TriStar Production Migration | — | Blocked on vendor: production API keys and URLs have not been received from TriStar. No code work needed — the integration is already built for the new API shape. Re-open when credentials arrive. |
| 4 | Staging Environment | — | Closed with #2. Staging's only near-term purpose was to smoke-test the TriStar prod migration. No other item in this list requires it. Re-open if #2 is unblocked. |

## Fixed

### Items 24 & 25 — ANVISA Filter and Empty Tabs (`dashboard-components.tsx`)

Two separate bugs in the same component.

**Item 24 — Status filter is decorative.**
The "Filtrar" dropdown renders `<DropdownMenuItem>Status</DropdownMenuItem>` but clicking it does nothing — no `onClick`, no state. The `filteredRequests` filter (line 79) only checks `patientDisplayName`. There is no `statusFilter` state anywhere in the component.

**Item 25 — Three tabs render blank content.**
`<Tabs defaultValue="all">` has four `TabsTrigger`s ("Todas", "Ativas", "Rascunho", "Arquivadas") but only one `TabsContent` (`value="all"`). Clicking "Ativas", "Rascunho", or "Arquivadas" shows a completely empty page — no rows, no empty state, no message. This is the "navigation issue": users click a tab and see nothing, think the page or their session is broken.

**Fixed.** Tabs are now controlled (`activeTab` state). The decorative filter dropdown was removed. The Card table sits directly inside `<Tabs>` (no `TabsContent`) and `filteredRequests` incorporates the tab filter:
- "Todas" → all statuses
- "Ativas" → PENDENTE, EM_AJUSTE, EM_AUTOMACAO, ERRO
- "Rascunho" → PENDENTE
- "Arquivadas" → CONCLUIDO

Page resets to 0 on tab or search change. CSV export respects the active tab filter.

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

**Fix options (pick one — confirm with PM):**
- **Fixed (Option A).** The `catch` block in `handleFileReady` now checks `err instanceof DOMException && err.name === 'AbortError'`. On timeout, shows a toast: "Tipo não reconhecido — A classificação demorou muito. Selecione o tipo manualmente." All other failures still fall back to `'general'` silently (non-blocking). `src/app/(app)/controle/[orderId]/page.tsx`.
