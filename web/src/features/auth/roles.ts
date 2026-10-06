export type Role = "learner" | "teacher" | "admin" | "super_admin";

export function normalizeRole(value: unknown): Role {
  // Existing profiles remain usable before 0004_account_roles.sql is applied.
  if (value === "instructor") return "teacher";
  if (value === "reviewer") return "admin";
  return value === "teacher" || value === "admin" || value === "super_admin" ? value : "learner";
}

export const canReview = (role: Role) => role === "admin" || role === "super_admin";
export const isStaff = (role: Role) => role === "teacher" || canReview(role);
