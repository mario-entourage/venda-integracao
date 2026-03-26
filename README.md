# ENTOURΛGE — Sales Integration Platform

Internal sales management platform for Entourage PhytoLab. Manages the full order lifecycle — from patient identification and payment processing through ANVISA import authorization and shipping.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 |
| UI | Tailwind CSS, Radix UI, shadcn/ui |
| Auth | Firebase Authentication (Google OAuth, domain-restricted) |
| Database | Cloud Firestore |
| Storage | Firebase Storage |
| AI | Google Gemini 2.5 Flash via Genkit |
| Hosting | Firebase App Hosting |

## Integrations

| Service | Purpose |
|---------|---------|
| **GlobalPay** | Payment link generation and webhook-based payment confirmation |
| **ZapSign** | Electronic document signing (Comprovante de Vínculo) |
| **BCB PTAX** | Daily USD → BRL exchange rates from the Central Bank of Brazil |
| **TriStar Express** | Shipment creation, tracking, and label generation |
| **Google Gemini** | AI-powered document classification and OCR extraction |

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A Firebase project with Authentication, Firestore, and Storage enabled

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Fill in the values in .env.local

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with a `@entouragelab.com` Google account.

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript compiler check |
| `npm run genkit:dev` | Start Genkit AI dev server |

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (app)/              # Authenticated app shell (sidebar + header)
│   │   ├── dashboard/      # Home dashboard
│   │   ├── remessas/       # Nova Venda wizard (3-step order creation)
│   │   ├── pedidos/        # In-progress orders list
│   │   ├── controle/       # Order management + CSV import
│   │   ├── clientes/       # Patient CRUD
│   │   ├── representantes/ # Sales rep CRUD
│   │   ├── medicos/        # Doctor CRUD
│   │   ├── estoque/        # Products & inventory
│   │   ├── documentos/     # Document registry
│   │   ├── checkout/       # Internal payment link management
│   │   ├── anvisa/         # ANVISA solicitation module
│   │   ├── usuarios/       # User management (admin)
│   │   └── ajuda/          # Help page
│   ├── (auth)/             # Login page
│   ├── checkout/           # Public customer-facing payment page
│   └── api/                # API routes & webhooks
├── components/
│   ├── ui/                 # shadcn/ui primitives
│   ├── shared/             # Reusable components (PageHeader, BrandLogo)
│   ├── layout/             # App shell (sidebar, header)
│   ├── auth/               # Auth guard, Google sign-in
│   └── vendas/             # Nova Venda wizard step components
├── firebase/               # Firebase client SDK setup & hooks
├── services/               # Firestore CRUD service functions
├── server/
│   ├── actions/            # Next.js server actions
│   └── integrations/       # External API clients (GlobalPay, ZapSign, etc.)
├── lib/                    # Utilities, constants, helpers
├── types/                  # TypeScript type definitions
├── hooks/                  # Custom React hooks
└── ai/                     # Genkit AI flows (document classification, OCR)
```

## Deployment

The app deploys to Firebase App Hosting with GitHub-triggered rollouts from the `main` branch.

To manually trigger a deploy:

```bash
firebase apphosting:rollouts:create vend-backend --git-branch main
```

## Documentation

- [`docs/requirements.md`](docs/requirements.md) — Functional & nonfunctional requirements
- [`docs/database-architecture.md`](docs/database-architecture.md) — Firestore schema and entity relationships
- [`docs/help.md`](docs/help.md) — End-user help content (rendered at `/ajuda`)

## Access Control

| Role | Permissions |
|------|------------|
| **admin** | Full access including user management, CSV import, and delete operations |
| **user** | Create and manage orders, clients, doctors, representatives |
| **view_only** | Read-only access to all modules |

Authentication is restricted to `@entouragelab.com` Google accounts. Super-admin users are defined by the `config/superAdmins` Firestore document (managed via Firebase Admin SDK); additional admins are managed via the `roles_admin` Firestore collection.
