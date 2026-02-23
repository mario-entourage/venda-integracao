import { UserGroupType } from '@/types/enums';

/**
 * Maps each UserGroupType enum value to a stable string identifier used
 * as the `groupId` field on User documents in Firestore.
 */
export const USER_GROUP_IDS: Record<string, string> = {
  [UserGroupType.ADMIN]: 'admin',
  [UserGroupType.CUSTOMER]: 'customer',
  [UserGroupType.REPRESENTATIVE]: 'representative',
  [UserGroupType.DOCTOR]: 'doctor',
};

/**
 * Dropdown / select options for user group selection in forms.
 * Labels are in Portuguese to match the application's locale.
 */
export const USER_GROUP_OPTIONS = [
  { value: UserGroupType.ADMIN, label: 'Administrador' },
  { value: UserGroupType.CUSTOMER, label: 'Cliente' },
  { value: UserGroupType.REPRESENTATIVE, label: 'Representante' },
  { value: UserGroupType.DOCTOR, label: 'Medico' },
] as const;
