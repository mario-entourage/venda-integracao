The project already has files in src/services/ and src/types/. To honor the "do not modify existing files" constraint, I'll isolate everything under src/mocks/ with its own types and services sub-folders, keeping the mock system fully self-contained and removable.
All files created. Here's the complete picture:

Folder structure

src/
├── mocks/
│   ├── mockDB.ts              ← in-memory database (users, products, orders)
│   ├── mockAdmin.ts           ← admin user generator
│   ├── mockProducts.ts        ← product generator
│   ├── mockOrders.ts          ← order generator
│   ├── mockPayments.ts        ← payment simulator (always approves)
│   ├── mockShipping.ts        ← tracking number generator (TRK-XXXXXXXX)
│   ├── types/
│   │   ├── user.ts
│   │   ├── product.ts
│   │   └── order.ts
│   └── services/
│       ├── adminService.ts
│       ├── productService.ts
│       ├── orderService.ts
│       ├── paymentService.ts
│       └── shippingService.ts
└── app/dev/test-order-flow/
    └── page.tsx
Note: Everything lives under src/mocks/ — not touching your existing src/services/ or src/types/ files.

Order Lifecycle

Step	      |  Status change

createOrder() |	paymentStatus: pending, orderStatus: pending

simulatePayment() |	paymentStatus: paid, orderStatus: paid

shipOrder()	|   orderStatus: shipped, trackingNumber: TRK-XXXXXXXX

markOrderCompleted()  |	orderStatus: completed

Example console output

[AdminService] Admin created: admin-1 (dev-admin@mock.dev)
[AdminService] Product created: product-1 — Produto Teste @ 4990¢ (stock: 100)
[OrderService] Order created: order-1 — 2x Produto Teste = 9980¢
[PaymentService] Payment approved for order: order-1
[ShippingService] Order shipped: order-1 — tracking: TRK-K7X2M9QA
[OrderService] Order completed: order-1

How to replace with real services

Mock file	  |    Replace with

mockDB.ts |	Firebase Firestore collections

mockPayments.ts |	stripe.paymentIntents.create() + webhook handler

mockShipping.ts	|  Correios / Melhor Envio / EasyPost API

mockAdmin.ts |	Firebase Admin SDK createUser() + setCustomUserClaims()

To fully remove the mock system: delete src/mocks/, update the service imports in page.tsx, and point them at your real service layer.

Visit /dev/test-order-flow in your browser to see the full flow rendered as JSON.