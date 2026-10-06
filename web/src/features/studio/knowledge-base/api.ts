import { request } from "@/lib/http";
import type { JsonExtraction, Passage, Resource, ResourceStatistics, UploadRegistration } from "./model";

export function knowledgeResources(params: { page: number; page_size: number; q: string; status?: string }, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(params.page), page_size: String(params.page_size), q: params.q });
  if (params.status) query.set("status", params.status);
  return request<{ resources: Resource[]; total: number; page: number; pageSize: number; statistics?: ResourceStatistics }>(`/admin/rag/resources?${query}`, undefined, signal);
}
export function knowledgeStatus(id: string, signal?: AbortSignal) { return request<Resource>(`/admin/rag/documents/${encodeURIComponent(id)}/status`, undefined, signal); }
export function registerResource(body: { filename: string; content_type: string; jsonExtraction?: JsonExtraction; title?: string; description?: string }) {
  return request<UploadRegistration>("/admin/rag/documents", body);
}
export function toggleResources(documentIds: string[], enabled: boolean) {
  return request<{ updated: number; enabled: boolean; documentIds: string[]; missingDocumentIds?: string[] }>("/admin/rag/resources/toggle", { documentIds, enabled });
}
export function saveResourceMetadata(id: string, body: { title: string; description: string }) {
  return request<Resource>(`/admin/rag/resources/${encodeURIComponent(id)}/metadata`, body);
}
export function deleteResource(id: string) {
  return request<{ documentId: string; deleted: boolean }>(`/admin/rag/resources/${encodeURIComponent(id)}/delete`, {});
}
export function testKnowledgeRetrieval(query: string, documentId?: string, signal?: AbortSignal) {
  return request<{ passages: Passage[]; eligibleResourceCount: number }>("/admin/rag/retrieval/test", { query, ...(documentId ? { documentId } : {}) }, signal);
}
