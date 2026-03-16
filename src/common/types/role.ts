export const APP_ROLES = ['ADMIN', 'MEMBER'] as const;

export type Role = (typeof APP_ROLES)[number];
