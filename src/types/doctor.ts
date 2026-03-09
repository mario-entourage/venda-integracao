import { Timestamp } from 'firebase/firestore';

export interface Doctor {
  id: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  email?: string;
  crm: string;
  mainSpecialty?: string;
  /** UF do estado onde o médico é registrado (ex: "SP") */
  state?: string;
  /** Município do prescritor */
  city?: string;
  /** Telefone fixo do consultório */
  phone?: string;
  /** Celular do prescritor */
  mobilePhone?: string;
  /** User ID of the assigned sales rep */
  repUserId?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}
