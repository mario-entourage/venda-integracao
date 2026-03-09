import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  /** Google OAuth email — unique per user, primary identifier. */
  email: string;
  /** Role: 'admin' | 'user' | 'view_only' */
  groupId: string;
  /** Display name (from Google OAuth / profile). Used for rep name lookups. */
  displayName?: string;
  /** Whether this user is a sales rep (representante). */
  isRepresentante?: boolean;
  /** Legacy representante doc ID (for migration traceability). */
  legacyRepresentanteId?: string;
  /** Notification preferences (defaults to all true if absent). */
  notificationPreferences?: NotificationPreferences;
  active: boolean;
  lastLogin?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}

export interface NotificationPreferences {
  emailOnPaymentLinkCreated: boolean;
  emailOnPaymentReceived: boolean;
  inAppOnPaymentLinkCreated: boolean;
  inAppOnPaymentReceived: boolean;
}

export interface UserProfile {
  id: string;
  userId: string;
  /** Nome completo */
  fullName: string;
  /** Sexo */
  sex?: string;
  /** Data de Nascimento */
  birthDate?: Timestamp;
  /** Estado (UF, 2 letras) */
  state?: string;
  /** Município */
  city?: string;
  /** Endereço (logradouro) */
  address?: string;
  /** E-mail */
  email: string;
  /** Nº do Documento de Identificação */
  documentNumber?: string;
  /** CEP */
  postalCode?: string;
  /** Celular */
  phone?: string;
  /** CPF */
  cpf?: string;
  /** Nome da Rua */
  streetName?: string;
  /** Número */
  streetNumber?: string;
  /** Complemento */
  complemento?: string;
  /** Bairro */
  bairro?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
