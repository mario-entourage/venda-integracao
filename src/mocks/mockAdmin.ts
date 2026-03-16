/**
 * Mock admin data generators.
 *
 * These functions produce fake admin users for testing.
 *
 * REPLACE LATER: use Firebase Admin SDK or your auth provider to
 * create real admin accounts with custom claims.
 *   e.g. admin.auth().createUser({ email, password })
 *        admin.auth().setCustomUserClaims(uid, { role: "admin" })
 */

import { MockUser } from "./types/user";

let adminCounter = 1;

export function generateAdmin(email?: string): MockUser {
  const id = `admin-${adminCounter++}`;
  return {
    id,
    email: email ?? `admin-${id}@entouragelab.com`,
    role: "admin",
  };
}
