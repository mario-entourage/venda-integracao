import { Timestamp } from 'firebase/firestore';
import { OrderStatus, AnvisaOption, OrderType, DocumentRequestStatus } from './enums';

export interface Order {
  id: string;
  status: OrderStatus;
  invoice: string;
  legalGuardian: boolean;
  currency: string;
  amount: number;
  discount: number;
  /** PTAX midpoint exchange rate (BRL per 1 USD) used at order creation */
  exchangeRate?: number;
  /** Date the PTAX rate was quoted (YYYY-MM-DD) */
  exchangeRateDate?: string;
  type: OrderType;
  anvisaOption?: AnvisaOption;
  anvisaStatus?: string;
  zapsignDocId?: string;
  zapsignStatus?: string;
  zapsignSignUrl?: string;
  documentsComplete: boolean;
  tristarShipmentId?: string;
  prescriptionDocId?: string;
  softDeleted?: boolean;
  createdById: string;
  createdAt: Timestamp;
  updatedById?: string;
  updatedAt: Timestamp;

  // ── Controle module — editable fields ──────────────────────────────────
  /** Nº Invoice (Correção / Duplicata) */
  invoiceCorrecao?: string;
  /** Meio de pagamento (Global Pays, Infinity Pays, PIX, Brazil Pays) */
  meioPagamento?: string;
  /** Status do orçamento */
  statusOrcamento?: string;
  /** Lead (Primeira compra, Recompra, etc.) */
  lead?: string;
  /** Forma de envio (Loggi, TriStar, SEDEX, etc.) */
  formaEnvio?: string;
  /** Lote / batch number */
  lote?: string;
  /** Data do envio (YYYY-MM-DD) */
  dataEnvio?: string;
  /** Previsão de entrega (YYYY-MM-DD) */
  previsaoEntrega?: string;
  /** Código de rastreio */
  codigoRastreio?: string;
  /** Status do envio */
  statusEnvio?: string;
  /** Data do orçamento — payment link creation date (YYYY-MM-DD) */
  dataOrcamento?: string;
  /** Batch import ID for CSV deduplication */
  batchImportId?: string;
}

export interface OrderCustomer {
  id: string;
  name: string;
  document: string;
  orderId: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderRepresentative {
  id: string;
  name: string;
  code: string;
  saleId: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderDoctor {
  id: string;
  name: string;
  crm: string;
  orderId: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderProduct {
  id: string;
  orderId: string;
  stockProductId: string;
  /** Product name from catalog (stored at order creation) */
  productName?: string;
  quantity: number;
  price: number;
  discount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface OrderShipping {
  id: string;
  tracking: string;
  price: number;
  insurance: boolean;
  insuranceValue: number;
  orderId: string;
  address?: ShippingAddress;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShippingAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface OrderDocumentRequest {
  id: string;
  orderId: string;
  documentType: string;
  status: DocumentRequestStatus;
  requestedAt: Timestamp;
  receivedAt?: Timestamp;
  documentId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
