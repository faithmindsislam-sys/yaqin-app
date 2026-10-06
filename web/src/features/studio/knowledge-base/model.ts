export const KB_STATUSES = ["WAITING_UPLOAD", "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"] as const;
export type IngestionStatus = typeof KB_STATUSES[number];
export type Resource = {
  documentId: string; resourceId?: string; filename: string; status: IngestionStatus; enabled: boolean;
  title?: string | null; description?: string | null;
  ocrUsed?: boolean | null; pages?: number | null; error?: string | null; ingestionJobId?: string | null;
  createdAt?: string | null; updatedAt?: string | null;
};
export type JsonExtraction = { textField: string; titleField?: string };
export type UploadRegistration = { documentId: string; resourceId: string; uploadUrl: string; method: string; expiresIn: number };
export type Passage = { id: string; text: string; filename: string; documentId: string; resourceId: string; score: number;
  title?: string | null; description?: string | null; pages?: number | null; pageStart?: number | null; pageEnd?: number | null };
export const resourceLabel = (row: Pick<Resource, "filename" | "resourceId" | "title" | "description">) =>
  row.title?.trim() || row.description?.trim() || row.filename || row.resourceId || "";
export const eligibleResource = (row: Resource) => row.status === "COMPLETED" && row.enabled;
export const pendingResource = (row: Resource) => !["COMPLETED", "FAILED"].includes(row.status);
export const MAX_RESOURCE_BYTES = 20 * 1024 * 1024;
export const RESOURCE_FORMATS: Record<string, string> = {
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", html: "text/html", htm: "text/html", csv: "text/csv",
};
export const fileType = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export function jsonRecords(raw: string): Record<string, unknown>[] {
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { throw new Error("jsonSyntax"); }
  const records = Array.isArray(data) ? data : [data];
  if (!records.length || records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    throw new Error("jsonStructure");
  }
  return records as Record<string, unknown>[];
}

export function extractJson(records: Record<string, unknown>[], selection: JsonExtraction): string {
  if (!selection.textField) throw new Error("textFieldRequired");
  return records.map((record) => {
    const text = record[selection.textField];
    const title = selection.titleField ? record[selection.titleField] : undefined;
    if (typeof text !== "string" || !text.trim()) throw new Error("jsonText");
    if (title != null && typeof title !== "string") throw new Error("jsonTitle");
    return (typeof title === "string" && title.trim() ? title.trim() + "\n\n" : "") + text.trim();
  }).join("\n\n---\n\n");
}

export async function validateResourceFile(file: File, json = false): Promise<string> {
  if (!file.size) throw new Error("emptyFile");
  if (file.size > MAX_RESOURCE_BYTES) throw new Error("tooLarge");
  if (file.name.length > 200 || /[\/\\\x00-\x1f]/.test(file.name)) throw new Error("invalidName");
  const extension = fileType(file.name);
  const contentType = json && extension === "json" ? "application/json" : RESOURCE_FORMATS[extension];
  if (!contentType || (json && extension !== "json")) throw new Error("unsupportedFile");
  if (extension === "pdf") {
    if (!(await file.slice(0, 1024).text()).includes("%PDF-")) throw new Error("invalidPdf");
  } else {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error("invalidText"); }
    if (!text.trim() || text.includes("\0")) throw new Error("invalidText");
    if (json) jsonRecords(text);
  }
  return contentType;
}

export function uploadResource(registration: UploadRegistration, file: File, contentType: string,
  onProgress: (value: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error("interrupted")); return; }
    if (registration.method !== "PUT" || !Number.isFinite(registration.expiresIn) || registration.expiresIn <= 0) {
      reject(new Error("expired")); return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = (error?: string) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(new Error(error)); else { onProgress(100); resolve(); }
    };
    xhr.open("PUT", registration.uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => done(xhr.status >= 200 && xhr.status < 300 ? undefined : xhr.status === 403 ? "expired" : "uploadFailed");
    xhr.onerror = () => done("uploadFailed");
    xhr.ontimeout = () => done("interrupted");
    xhr.onabort = () => done("interrupted");
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}

export type ResourceStatistics = { loaded: number; completed: number; eligible: number; waiting: number;
  queued: number; processing: number; failed: number };
export const STATUS_COUNT = { WAITING_UPLOAD: "waiting", PENDING: "queued", IN_PROGRESS: "processing", COMPLETED: "completed", FAILED: "failed" } as const;
