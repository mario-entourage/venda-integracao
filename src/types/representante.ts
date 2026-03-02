import { Timestamp } from 'firebase/firestore';

export interface Representante {
  id: string;
  name: string;
  /** Short uppercase identifier code, e.g. "REP001" */
  code: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}
