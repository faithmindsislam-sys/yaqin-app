import { request } from "@/lib/http";
import type { Role } from "@/features/auth/roles";
import type { LessonEvent } from "../api";

export type AdminUser = {
  id: string; email: string | null; display_name: string | null; role: Role; created_at: string;
  last_sign_in_at: string | null; disabled: boolean;
  daily_reserved_tokens?: number | null;
  standalone_daily_reserved_tokens?: number | null;
  daily_actual_tokens?: number | null;
  daily_usage_unknown_calls?: number | null;
  daily_calls?: number | null;
  daily_input_tokens?: number | null;
  daily_output_tokens?: number | null;
  daily_cache_read_tokens?: number | null;
  daily_cache_write_tokens?: number | null;
  standalone_daily_calls?: number | null;
  standalone_daily_input_tokens?: number | null;
  standalone_daily_output_tokens?: number | null;
  standalone_daily_cache_read_tokens?: number | null;
  standalone_daily_cache_write_tokens?: number | null;
  standalone_daily_actual_tokens?: number | null;
  standalone_daily_usage_unknown_calls?: number | null;
};
export type AdminUserList = { items: AdminUser[]; total: number; counts: Record<Role | "total" | "disabled", number>; daily_token_limit?: number };
export function listUsers(params: { q: string; role?: Role; status?: "active" | "disabled"; page: number; page_size: number }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  return request<AdminUserList>(`/admin/users?${query}`);
}
export function changeUserRole(id: string, role: Role) {
  return request<{ id: string; role: Role }>(`/admin/users/${encodeURIComponent(id)}/role`, { role });
}
export function setUserDisabled(id: string, disabled: boolean) {
  return request<{ id: string; disabled: boolean }>(`/admin/users/${encodeURIComponent(id)}/status`, { disabled });
}
export function userEvents(id: string) { return request<LessonEvent[]>(`/admin/users/${encodeURIComponent(id)}/events`); }
