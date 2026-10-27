import type { Role } from "@/generated/prisma/enums";

/** Permissões por papel. ADMIN tem todas. */
export const PERMISSIONS = [
  "dashboard:read",
  "lead:read",
  "lead:write",
  "lead:export",
  "lead:delete",
  "campaign:read",
  "campaign:write",
  "message:read",
  "message:write",
  "message:approve",
  "message:send",
  "proposal:read",
  "proposal:write",
  "proposal:approve",
  "report:read",
  "settings:read",
  "settings:write",
  "integration:manage",
  "user:manage",
  "audit:read",
  "cost:write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR: Permission[] = [
  "dashboard:read",
  "lead:read",
  "lead:write",
  "lead:export",
  "campaign:read",
  "campaign:write",
  "message:read",
  "message:write",
  "message:approve",
  "message:send",
  "proposal:read",
  "proposal:write",
  "report:read",
  "settings:read",
];

const VIEWER: Permission[] = [
  "dashboard:read",
  "lead:read",
  "campaign:read",
  "message:read",
  "proposal:read",
  "report:read",
  "settings:read",
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  OPERATOR: new Set(OPERATOR),
  VIEWER: new Set(VIEWER),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
