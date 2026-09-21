// Client-safe role & permission model. Contains NO CFX ids and NO secrets —
// only the shape of permissions and the default role definitions. Safe to ship
// to the browser. The actual roster (which CFX id has which role) lives in the
// server-only file `roster.server.ts` and never reaches the client bundle.

export const PERMISSIONS = [
  // Wishlist admin
  "wishlist.view",
  "wishlist.remove",
  "wishlist.gift",
  // Logs
  "logs.view",
  // Contact / email broadcast
  "contact.send",
  // Lookup
  "lookup.view",
  // Management — payments
  "management.refund",
  "management.payment",
  // Management — coupons
  "coupon.view",
  "coupon.create",
  "coupon.edit",
  "coupon.delete",
  // Management — giftcards
  "giftcard.view",
  "giftcard.create",
  "giftcard.edit",
  "giftcard.delete",
  // Management — roster (add CFX ids + assign roles)
  "roster.view",
  "roster.manage",
  // Management — roles
  "roles.view",
  "roles.create",
  "roles.edit",
  "roles.delete",
  // Referral program
  "referral.view",
  "referral.manage",
  // Partners / clients
  "partners.view",
  "partners.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Wildcard grants every permission (founder).
export const ALL_PERMISSIONS = "*" as const;

export type PermissionGrant = Permission[] | typeof ALL_PERMISSIONS;

export type RoleKey = "founder" | "management" | "support" | (string & {});

export type RoleDefinition = {
  label: string;
  description: string;
  permissions: PermissionGrant;
};

// Built-in roles. Founder can create additional custom roles in roster.server.ts.
export const DEFAULT_ROLES: Record<string, RoleDefinition> = {
  founder: {
    label: "Founder",
    description: "Vollzugriff auf alle Bereiche. Kann Rollen erstellen und verwalten.",
    permissions: ALL_PERMISSIONS,
  },
};

export function hasPermission(
  granted: PermissionGrant | undefined,
  needed: Permission,
): boolean {
  if (!granted) return false;
  if (granted === ALL_PERMISSIONS) return true;
  return granted.includes(needed);
}

// Public shape returned to the client. Deliberately excludes the CFX id.
export type AdminSession = {
  isAdmin: boolean;
  role: RoleKey | null;
  roleLabel: string | null;
  permissions: PermissionGrant;
};

export const EMPTY_SESSION: AdminSession = {
  isAdmin: false,
  role: null,
  roleLabel: null,
  permissions: [],
};
