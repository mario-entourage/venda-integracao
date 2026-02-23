import { Timestamp } from 'firebase/firestore';

export interface MedicalSpecialty {
  id: string;
  name: string;
  description?: string;
  doctorId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
