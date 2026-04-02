# TODOS

## Completed

### P2 — Rascunho tab semantics
PENDENTE split into two statuses: RASCUNHO (draft, not yet submitted) and PENDENTE (submitted, waiting to be picked up). TAB_STATUSES, statusMap, nova page default, and request-components transition all updated.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P3 — `useMemo` misuse for page reset side-effect
Changed `useMemo(() => setCurrentPage(0), ...)` to `useEffect` in `dashboard-components.tsx`.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P3 — Non-admin users see their soft-deleted requests
Added `where('softDeleted', '==', false)` to the non-admin query in `dashboard-components.tsx`.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P3 — Shared `isDeleting` flag between single-delete and batch-delete
Split into `isSingleDeleting` and `isBatchDeleting` state variables in `dashboard-components.tsx`.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P2 — Storage orphan on Firestore write failure
Added `deleteObject` cleanup in the catch block of `handleFileReady` in `controle/[orderId]/page.tsx`. If the Firestore write fails, the orphaned storage file is deleted.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P2 — Subcollection data goes stale while page is open
Replaced one-time `getDocs` fetch with real-time `onSnapshot` subscriptions for customer, doctor, representative, and products subcollections. Cleanup on unmount.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P2 — Representative name wrong if `repUsers` hasn't loaded
Added `!repUsers` to the disabled condition on the representative Select. Users can't change rep until the rep list loads.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P3 — `handleCancel` sets state on potentially-unmounted component
Moved `setIsCancelling(false)` and `setConfirmCancel(false)` out of the `finally` block. On success, `router.push` navigates away (skipping setState). On error, state updates run normally.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P2 — No file size guard before base64 upload to classify API
Added 10MB size check before AI classification in both `controle/[orderId]/page.tsx` and `step-identificacao.tsx`. Oversized files skip classification with a user-facing message.
**Completed:** fix/todos-batch-cleanup (2026-03-31)

### P3 — HTTP 200 returned on AI error
Changed extract-prescription error response from status 200 to 422. Updated the caller in `step-identificacao.tsx` to parse the error body from non-OK responses.
**Completed:** fix/todos-batch-cleanup (2026-03-31)
