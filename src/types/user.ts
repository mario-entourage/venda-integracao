import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  document: string;
  groupId: string;
  representativeId?: string;
  active: boolean;
  status: string;
  birthDate?: Timestamp;
  sex?: string;
  motherName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  email?: string;
  phone?: string;
  userId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserAddress {
  id: string;
  userId: string;
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserGroup {
  id: string;
  type: string;
  name: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Session {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
