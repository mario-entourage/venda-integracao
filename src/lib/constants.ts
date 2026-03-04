import { OrderStatus, PaymentStatus, UserGroupType, DocumentType, AnvisaOption, OrderType } from '@/types/enums';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Pendente',
  [OrderStatus.PROCESSING]: 'Processando',
  [OrderStatus.AWAITING_DOCUMENTS]: 'Aguardando Documentos',
  [OrderStatus.DOCUMENTS_COMPLETE]: 'Documentos Completos',
  [OrderStatus.AWAITING_PAYMENT]: 'Aguardando Pagamento',
  [OrderStatus.PAID]: 'Pago',
  [OrderStatus.SHIPPED]: 'Enviado',
  [OrderStatus.DELIVERED]: 'Entregue',
  [OrderStatus.CANCELLED]: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.CREATED]: 'Criado',
  [PaymentStatus.PENDING]: 'Pendente',
  [PaymentStatus.PROCESSING]: 'Processando',
  [PaymentStatus.APPROVED]: 'Aprovado',
  [PaymentStatus.FAILED]: 'Falhou',
  [PaymentStatus.REFUNDED]: 'Reembolsado',
  [PaymentStatus.CANCELLED]: 'Cancelado',
};

export const USER_GROUP_LABELS: Record<UserGroupType, string> = {
  [UserGroupType.ADMIN]: 'Administrador',
  [UserGroupType.USER]: 'Usuário',
  [UserGroupType.VIEW_ONLY]: 'Somente Visualização',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.PRESCRIPTION]: 'Receita Medica',
  [DocumentType.IDENTITY]: 'Documento de Identidade',
  [DocumentType.MEDICAL_REPORT]: 'Laudo Medico',
  [DocumentType.PROOF_OF_ADDRESS]: 'Comprovante de Endereco',
  [DocumentType.INVOICE]: 'Nota Fiscal',
  [DocumentType.ANVISA_AUTHORIZATION]: 'Autorizacao ANVISA',
};

export const ANVISA_OPTION_LABELS: Record<AnvisaOption, string> = {
  [AnvisaOption.REGULAR]: 'Regular',
  [AnvisaOption.EXCEPTIONAL]: 'Excepcional',
  [AnvisaOption.EXEMPT]: 'Isento',
};

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const DEFAULT_CURRENCY = 'BRL';
export const DEFAULT_FREIGHT = 30.0;
export const PAYMENT_LINK_EXPIRATION_HOURS = 24;
export const FIRST_INVOICE_NUMBER = 1000;

export const APP_NAME = 'ENTOURΛGE';
export const SUPPORT_WHATSAPP = '+5511981333669';
