import { Timestamp } from 'firebase/firestore';

export interface Representante {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  estado?: string;
  /** Optional link to a user in the `users` collection */
  userId?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}
