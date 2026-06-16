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
  /**
   * True for sales reps who exist only to receive sales credit and have no
   * Firebase Auth identity (e.g. third-party reps without an @entouragelab.com
   * email). These users can NEVER sign in — `groupId` is set to 'user' as a
   * placeholder. Always paired with `isRepresentante === true`.
   */
  external?: boolean;
  /** UF / two-letter state code. Captured for external reps; optional. */
  state?: string;
  /** Legacy representante doc ID (for migration traceability). */
  legacyRepresentanteId?: string;
  /**
   * Set when this user doc was folded into another (canonical, UID-keyed) user
   * on login — e.g. a rep that an admin created without a login (external-rep
   * flow) who later signs in. The doc is deactivated and points here so
   * historical order credit can still be resolved to the surviving user.
   */
  mergedIntoUid?: string;
  /** Notification preferences (defaults to all true if absent). */
  notificationPreferences?: NotificationPreferences;
  active: boolean;
  lastLogin?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}

export interface NotificationPreferences {
  emailOnOrderCreated: boolean;
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
