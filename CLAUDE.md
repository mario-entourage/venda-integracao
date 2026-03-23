# CLAUDE.md — Entourage Lab Sales Integration

## Project Overview

Internal sales management platform for Entourage Lab. Handles orders, prescriptions, payments, TriStar Express shipping, and ANVISA compliance for pharmaceutical products.

**Tech stack:** Next.js 15 (App Router), TypeScript, Firebase (Auth + Firestore + Storage), Tailwind CSS, shadcn/ui

## Authentication

**CRITICAL: Every client-side fetch to `/api/*` routes (except webhooks) MUST include an Authorization header.**

### The Pattern

Use `useAuthFetch()` hook for all client-side API calls to protected routes:

```typescript
import { useAuthFetch } from '@/hooks/use-auth-fetch';

// In your component:
const authFetch = useAuthFetch();
const res = await authFetch('/api/payments/sync', {
  method: 'POST',
  body: JSON.stringify({ orderId }),
});
```

For non-component code (services, utilities), use `authFetchWithToken()`:

```typescript
import { authFetchWithToken } from '@/hooks/use-auth-fetch';

// Caller provides the token:
const res = await authFetchWithToken(idToken, '/api/notifications/send-email', {
  method: 'POST',
  body: JSON.stringify({ to, subject, html }),
});
```

### Why This Matters

All API routes under `/api/` use `requireAuth()` (in `src/app/api/_require-auth.ts`) which validates a Firebase ID token from the `Authorization: Bearer <token>` header. If the header is missing, the request returns 401 silently — no error toast, no redirect, just a broken feature.

**Exceptions (no auth needed):**
- `/api/webhooks/payment` — uses `X-Webhook-Token`
- `/api/webhooks/zapsign` — uses `X-ZapSign-Token`
- `/api/admin/*` — uses `requireAdmin()` (stricter, same header pattern)

### When Adding New API Routes

1. Always add `requireAuth()` (or `requireAdmin()`)
2. Update the client-side caller to use `useAuthFetch()` or include `Authorization: Bearer` header
3. Test that the feature works when logged in — a 401 means the header is missing

## Testing

Run the dev server: `npm run dev`

Build check: `npx next build`

## File Structure

- `src/app/api/` — API route handlers (all require auth)
- `src/components/vendas/` — Sales wizard steps
- `src/components/shipping/` — TriStar shipping dialogs
- `src/services/` — Firestore CRUD services
- `src/server/actions/` — Next.js server actions (no auth header needed — server-side)
- `src/hooks/` — React hooks including `useAuthFetch`
- `src/lib/` — Utilities including `fetchWithTimeout`
