# TODOS

## ANVISA Dashboard

### P2 — Rascunho tab semantics
PENDENTE status represents "not yet picked up", which maps to Rascunho (Draft). If a distinct draft/submitted concept is needed, a new status should be added to `AnvisaRequestStatus` and the backend should set it accordingly.
- **Context:** `TAB_STATUSES` in `dashboard-components.tsx` uses PENDENTE for both "Rascunho" — PM to confirm this mapping is correct or whether separate statuses are needed.

### P3 — `useMemo` misuse for page reset side-effect
`useMemo(() => setCurrentPage(0), [search, activeTab])` in `dashboard-components.tsx` uses `useMemo` as a side-effect mechanism, which React does not guarantee. Should be `useEffect`.
- **Context:** Pre-existing pattern, works in React 18 today but is a correctness risk in future React versions.

### P3 — Non-admin users see their soft-deleted requests
The query for non-admin users does not filter `softDeleted == false`, so owners see their own deleted records in the table.
- **Context:** `dashboard-components.tsx` line ~75. Admin query correctly filters `softDeleted == false`; user query does not.

### P3 — Shared `isDeleting` flag between single-delete and batch-delete
Both delete flows share one `isDeleting` state flag, which could cause conflicts if both dialogs were open simultaneously.
- **Context:** Low risk with current UI, but fragile to future refactoring.

## Order Detail / Controle

### P2 — Storage orphan on Firestore write failure
When a file is uploaded to Firebase Storage but `createDocumentRecord` fails (Firestore write error), the file remains in Storage with no corresponding Firestore record.
- **Context:** `controle/[orderId]/page.tsx` — `handleFileReady`. No cleanup or retry on partial failure.

### P2 — Subcollection data goes stale while page is open
`customer`, `doctor`, `representative`, and `products` subcollections are fetched once on mount. If another user edits these while the page is open, the displayed data is stale with no indicator.
- **Context:** `controle/[orderId]/page.tsx` — the `useEffect` at lines 115–152 uses `[firestore, orderId]` deps without a real-time subscription.

### P2 — Representative name wrong if `repUsers` hasn't loaded
If the representative dropdown is changed before `repUsers` loads, `repUser` resolves to `undefined` and the Firestore write saves `'Venda Direta'` as the representative name.
- **Context:** `controle/[orderId]/page.tsx` line ~278 — missing loading guard on the Select.

### P3 — `handleCancel` sets state on potentially-unmounted component
`router.push` is called before `setIsCancelling(false)` in the `finally` block. If navigation is fast, the component unmounts and the setState runs on an unmounted component.
- **Context:** `controle/[orderId]/page.tsx` — `handleCancel`, lines 343–360.

## AI / API

### P2 — No file size guard before base64 upload to classify API
Files up to 5MB are accepted but no client-side size check occurs before `fileToBase64` + classify call. A 5MB file becomes ~6.7MB of JSON. The classify API passes this to Gemini which has its own limits.
- **Context:** `controle/[orderId]/page.tsx` `handleFileReady` + `step-identificacao.tsx`. Add a size check (e.g., 2MB) before calling the classify endpoint.

### P3 — HTTP 200 returned on AI error
`/api/ai/extract-prescription/route.ts` returns `status: 200` with an `_error` field on failure. This defeats standard HTTP error rate monitoring tools.
- **Context:** The calling code in `step-identificacao.tsx` checks `data._error` correctly, but standard observability (uptime monitors, Vercel logs) won't count these as errors.

## Completed
