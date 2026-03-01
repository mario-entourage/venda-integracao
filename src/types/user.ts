import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  /** Google OAuth email — unique per user, primary identifier. */
  email: string;
  /** Role: 'admin' | 'user' | 'view_only' */
  groupId: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
