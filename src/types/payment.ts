import { Timestamp } from 'firebase/firestore';

export interface Payment {
  id: string;
  provider: string;
  status: string;
  currency: string;
  amount: number;
  paymentLinkId?: string;
  paymentId?: string;
  paymentUrl?: string;
  paymentDate?: Timestamp;
  orderId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentLink {
  id: string;
  status: string;
  currency: string;
  amount: number;
  referenceId?: string;
  paymentMethod?: string;
  paymentUrl?: string;
  exchangeAtPayment?: number;
  feeForMerchant: boolean;
  installmentMerchant: number;
  installmentCustomer?: number;
  secretKey: string;
  orderId: string;
  provider: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Denormalized fields for Pagamentos list view */
  doctorName?: string;
  repName?: string;
  invoice?: string;
  clientName?: string;
}

export interface ExchangeQuote {
  id: string;
  currency: string;
  amount: number;
  amountNet: number;
  exchange: number;
  exchangeRef: number;
  platformFee: number;
  gatewayFee: number;
  iof: number;
  paymentLinkId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PaymentMethod {
  id: string;
  amount: number;
  amountNet: number;
  platformFee: number;
  gatewayFee: number;
  installments: PaymentMethodInstallment[];
  pixQuoteId?: string;
  creditCardQuoteId?: string;
}

export interface PaymentMethodInstallment {
  id: string;
  number: number;
  value: number;
  amount: number;
  amountNet: number;
  platformFee: number;
  gatewayFee: number;
  iof: number;
  feeForMerchant: boolean;
  paymentMethodId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
