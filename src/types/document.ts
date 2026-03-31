import { Timestamp } from 'firebase/firestore';

export interface DocumentRecord {
  id: string;
  type: string;
  holder: string;
  key: string;
  number: string;
  metadata: Record<string, unknown>;
  userId: string;
  orderId?: string;
  /** FK → clients collection. Used to group documents by client in the Documentos view. */
  clientId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
