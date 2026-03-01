import { UserGroupType } from '@/types/enums';

/**
 * Maps each UserGroupType enum value to a stable string identifier used
 * as the `groupId` field on User documents in Firestore.
 */
export const USER_GROUP_IDS: Record<string, string> = {
  [UserGroupType.ADMIN]: 'admin',
  [UserGroupType.USER]: 'user',
  [UserGroupType.VIEW_ONLY]: 'view_only',
};

/**
 * Dropdown / select options for user group selection in forms.
 * Labels are in Portuguese to match the application's locale.
 */
export const USER_GROUP_OPTIONS = [
  { value: UserGroupType.ADMIN, label: 'Administrador' },
  { value: UserGroupType.USER, label: 'Usuário' },
  { value: UserGroupType.VIEW_ONLY, label: 'Somente Visualização' },
] as const;
