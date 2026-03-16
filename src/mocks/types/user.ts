/**
 * Mock type definitions for User.
 *
 * REPLACE LATER: swap this with your Firebase/Firestore user document type.
 * e.g. import { DocumentData } from "firebase/firestore";
 */

export type UserRole = "admin" | "user";

export interface MockUser {
  id: string;
  email: string;
  role: UserRole;
}
