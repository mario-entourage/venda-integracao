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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
