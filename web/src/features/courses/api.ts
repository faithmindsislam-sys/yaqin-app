import { request } from "@/lib/http";
import type { ContentBundle } from "@/lib/types";

export function contentBundle() { return request<ContentBundle>("/content"); }
