import { Timestamp } from 'firebase/firestore';

export interface Doctor {
  id: string;
  document: string; // CPF
  firstName: string;
  lastName?: string;
  fullName: string;
  email?: string;
  crm: string;
  mainSpecialty?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}
