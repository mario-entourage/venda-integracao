import { Timestamp } from 'firebase/firestore';

export interface Client {
  id: string;
  document: string; // CPF or CNPJ
  /** Número do RG (documento de identidade) */
  rg?: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  email?: string;
  phone?: string;
  birthDate?: Timestamp;
  sex?: 'M' | 'F' | 'O';
  motherName?: string;
  representativeId?: string;
  address?: ClientAddress;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}

export interface ClientAddress {
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
}
