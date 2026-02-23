export enum UserGroupType {
  ADMIN = 'ADMIN',
  REPRESENTATIVE = 'REPRESENTATIVE',
  CUSTOMER = 'CUSTOMER',
  DOCTOR = 'DOCTOR',
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  AWAITING_DOCUMENTS = 'awaiting_documents',
  DOCUMENTS_COMPLETE = 'documents_complete',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID = 'paid',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  CREATED = 'created',
  PENDING = 'pending',
  PROCESSING = 'processing',
  APPROVED = 'approved',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

export enum DocumentType {
  PRESCRIPTION = 'prescription',
  IDENTITY = 'identity',
  MEDICAL_REPORT = 'medical_report',
  PROOF_OF_ADDRESS = 'proof_of_address',
  INVOICE = 'invoice',
  ANVISA_AUTHORIZATION = 'anvisa_authorization',
}

export enum AnvisaOption {
  REGULAR = 'regular',
  EXCEPTIONAL = 'exceptional',
  EXEMPT = 'exempt',
}

export enum DocumentRequestStatus {
  PENDING = 'pending',
  RECEIVED = 'received',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum OrderType {
  SALE = 'sale',
  RETURN = 'return',
  EXCHANGE = 'exchange',
}
