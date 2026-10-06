"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Braces, FileText, FileUp, LoaderCircle, Type, X } from "lucide-react";
import { Select } from "@/components/Select";
import { registerResource, toggleResources } from "@/features/studio/knowledge-base/api";
import { extractJson, jsonRecords, uploadResource, validateResourceFile, type JsonExtraction, type Resource } from "@/features/studio/knowledge-base/model";
import { K } from "@/features/studio/knowledge-base/strings";
import { useI18n } from "@/lib/i18n";

export function AddResource({ replacement, onClose, onRegistered, onComplete }: {
  replacement?: string; onClose: () => void; onRegistered: (row: Resource) => void; onComplete: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"file" | "text" | "json">("file");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [jsonFilename, setJsonFilename] = useState("");
  const [textField, setTextField] = useState("");
  const [titleField, setTitleField] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [phase, setPhase] = useState<"idle" | "registering" | "uploading">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const fileRead = useRef(0);
  const busy = phase !== "idle";
  const failure = (e: unknown) => {
    const code = e instanceof Error ? e.message : "uploadFailed";
    return t(K.validation[code as keyof typeof K.validation]) || code;
  };

  useEffect(() => {
    active.current = true;
    const reads = fileRead;
    dialog.current?.showModal();
    return () => { active.current = false; controller.current?.abort(); reads.current++; };
  }, []);

  const json = useMemo(() => {
    if (!rawJson.trim()) return { fields: [] as string[], preview: "", error: "" };
    let fields: string[] = [];
    try {
      const records = jsonRecords(rawJson);
      fields = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
      const preview = textField ? extractJson(records, { textField, ...(titleField ? { titleField } : {}) }) : "";
      return { fields, preview, error: "" };
    } catch (e) { return { fields, preview: "", error: e instanceof Error ? e.message : "jsonSyntax" }; }
  }, [rawJson, textField, titleField]);

  async function chooseJson(selected: File | undefined) {
    const request = ++fileRead.current;
    setError(null);
    if (!selected) return;
    setReading(true);
    try {
      await validateResourceFile(selected, true);
      const raw = await selected.text();
      if (request !== fileRead.current || !active.current) return;
      setRawJson(raw); setJsonFilename(selected.name); setTextField(""); setTitleField("");
    } catch (e) { if (request === fileRead.current && active.current) setError(failure(e)); }
    finally { if (request === fileRead.current && active.current) setReading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
    setError(null); setRegisteredId(null); setProgress(0); setPhase("registering");
    try {
      let resourceFile: File;
      let extraction: JsonExtraction | undefined;
      if (mode === "file") {
        if (!file) throw new Error("emptyFile");
        resourceFile = file;
      } else {
        const filename = mode === "json" && jsonFilename ? jsonFilename : name.trim();
        if (!filename || /[\/\\\x00-\x1f]/.test(filename)) throw new Error("invalidName");
        const suffix = mode === "text" ? ".txt" : ".json";
        if (mode === "json") {
          extraction = { textField, ...(titleField ? { titleField } : {}) };
          extractJson(jsonRecords(rawJson), extraction);
        } else if (!text.trim()) throw new Error("invalidText");
        resourceFile = new File([mode === "text" ? text : rawJson], filename.toLowerCase().endsWith(suffix) ? filename : filename + suffix,
          { type: mode === "text" ? "text/plain" : "application/json" });
      }
      const contentType = await validateResourceFile(resourceFile, mode === "json");
      if (!active.current) return;
      const registration = await registerResource({ filename: resourceFile.name, content_type: contentType,
        title: title.trim(), description: description.trim(),
        ...(extraction ? { jsonExtraction: extraction } : {}) });
      const expiresAt = Date.now() + registration.expiresIn * 1000;
      if (!active.current) return;
      setRegisteredId(registration.documentId);
      const row: Resource = { documentId: registration.documentId, resourceId: registration.resourceId,
        filename: resourceFile.name, title: title.trim(), description: description.trim(), status: "WAITING_UPLOAD", enabled: true };
      onRegistered(row);
      // Registration defaults enabled=true. Confirm exclusion before the file can reach storage.
      if (!enabled) {
        const result = await toggleResources([registration.documentId], false);
        if (result.updated !== 1 || result.enabled !== false || !result.documentIds.includes(registration.documentId)) {
          throw new Error(t(K.partial));
        }
        if (!active.current) return;
        onRegistered({ ...row, enabled: false });
      }
      if (Date.now() >= expiresAt) throw new Error("expired");
      controller.current = new AbortController();
      setPhase("uploading");
      await uploadResource({ ...registration, expiresIn: (expiresAt - Date.now()) / 1000 }, resourceFile, contentType,
        (value) => { if (active.current) setProgress(value); }, controller.current.signal);
      if (active.current) onComplete();
    } catch (e) { if (active.current) setError(failure(e)); }
    finally { if (active.current) setPhase("idle"); }
  }

  const modeIcons = { file: FileUp, text: Type, json: Braces };
  return <dialog ref={dialog} className="card studio-dialog kb-dialog kb-add-dialog" aria-labelledby="kb-add-title"
    onClose={onClose} onCancel={(event) => { if (busy) event.preventDefault(); }}
    onClick={(event) => { if (!busy && event.target === event.currentTarget) dialog.current?.close(); }}>
    <header className="flex items-start justify-between gap-4 border-b border-line p-6">
      <div><h2 id="kb-add-title" className="font-serif text-2xl">{t(replacement ? K.replacement : K.add)}</h2>
        <p className="mt-2 text-sm text-muted">{replacement ? <>{t(K.replacementHint)} <bdi>{replacement}</bdi></> : t(K.addHint)}</p></div>
      <button type="button" className="btn btn-ghost !p-2" disabled={busy} aria-label={t(K.close)} onClick={() => dialog.current?.close()}><X className="h-5 w-5" aria-hidden /></button>
    </header>
    <form className="kb-add-form" onSubmit={(event) => void save(event)}>
      <div className="kb-dialog-body space-y-5 p-6">
      <fieldset disabled={busy || reading} className="space-y-5">
        <legend className="sr-only">{t(K.modeLabel)}</legend>
        <div className="kb-modes">{(["file", "text", "json"] as const).map((value) => { const Icon = modeIcons[value]; return <label key={value} className={mode === value ? "is-active" : ""}>
          <input type="radio" name="resource-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setError(null); }} /><Icon className="h-4 w-4" aria-hidden />{t(K.modes[value])}
        </label>; })}</div>
        {mode === "file" && <label className="kb-upload-box"><span className="kb-upload-icon">{file ? <FileText className="h-6 w-6" aria-hidden /> : <FileUp className="h-6 w-6" aria-hidden />}</span>
          <span id="kb-file-label" className="sr-only">{t(K.fileLabel)}</span><span className="kb-upload-caption">{file ? <bdi>{file.name}</bdi> : t(K.chooseFileHint)}</span>
          <input type="file" className="input kb-file" aria-labelledby="kb-file-label" aria-describedby="kb-file-hint" accept=".pdf,.txt,.md,.html,.htm,.csv" required
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(null); }} />
          <span id="kb-file-hint" className="mt-2 block text-xs text-muted">{t(K.fileHint)}</span>
        </label>}
        {mode === "text" && <>
          <label className="block"><span className="studio-field-label">{t(K.name)}</span><input className="input" required maxLength={196} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="block"><span className="studio-field-label">{t(K.text)}</span><textarea className="input min-h-48" dir="auto" required value={text} onChange={(event) => setText(event.target.value)} /></label>
        </>}
        {mode === "json" && <>
          <p className="text-sm text-muted">{t(K.jsonHint)}</p>
          <label className="block"><span className="studio-field-label">{t(K.jsonFile)}</span><input type="file" className="input kb-file" accept=".json,application/json" onChange={(event) => void chooseJson(event.target.files?.[0])} /></label>
          <label className="block"><span className="studio-field-label">{t(K.jsonPaste)}</span><textarea className="input min-h-36 font-mono text-xs" dir="ltr" value={rawJson} required
            onChange={(event) => { fileRead.current++; setRawJson(event.target.value); setJsonFilename(""); setTextField(""); setTitleField(""); }} /></label>
          <label className="block"><span className="studio-field-label">{t(K.name)}</span><input className="input" maxLength={195} required={!jsonFilename} value={jsonFilename || name}
            onChange={(event) => { setJsonFilename(""); setName(event.target.value); }} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={t(K.textField)} value={textField} options={[{ value: "", label: t(K.chooseField) }, ...json.fields.map((value) => ({ value, label: value }))]} onChange={setTextField} />
            <Select label={t(K.titleField)} value={titleField} options={[{ value: "", label: t(K.noTitle) }, ...json.fields.map((value) => ({ value, label: value }))]} onChange={setTitleField} />
          </div>
          {json.error && <p role="alert" className="text-sm text-rose">{failure(new Error(json.error))}</p>}
          <div><p className="studio-field-label">{t(K.preview)}</p><pre dir="auto" className="kb-preview">{json.preview || t(K.chooseField)}</pre></div>
        </>}
        <div className="kb-metadata-fields space-y-4"><p className="text-xs text-muted">{t(K.metadataHint)}</p>
          <label className="block"><span className="studio-field-label">{t(K.bookTitle)}</span><input className="input" dir="auto" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div><label className="block"><span className="studio-field-label">{t(K.summary)}</span><input className="input" dir="auto" aria-describedby="kb-add-summary-hint" maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} /></label><p id="kb-add-summary-hint" className="mt-1 text-xs text-muted">{t(K.summaryHint)}</p></div>
        </div>
        <label className="kb-retrieval-setting"><input type="checkbox" aria-labelledby="kb-enable-label" aria-describedby="kb-enable-hint" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><span id="kb-enable-label" className="block font-medium">{t(K.enableWhenReady)}</span><span id="kb-enable-hint" className="mt-1 block text-xs text-muted">{t(K.retrievalSettingHint)}</span></span></label>
      </fieldset>
      {reading && <p role="status" className="text-sm text-muted">{t(K.loading)}</p>}
      {phase === "registering" && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />{t(K.saving)}</p>}
      {phase === "uploading" && <div role="status" className="space-y-2">
        <label htmlFor="kb-transfer-progress" className="text-sm">{t(K.uploading)} · {progress}%</label>
        <progress id="kb-transfer-progress" className="kb-progress" value={progress} max={100} />
        <p className="text-xs text-muted">{t(K.transferHint)}</p>
      </div>}
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-rose"><p>{error}</p>
        {registeredId && <><p className="mt-2 text-ink-soft">{t(K.preserved)}</p><p className="mt-2 break-all">{t(K.documentId)}: <bdi>{registeredId}</bdi></p></>}
      </div>}
      </div>
      <footer className="kb-dialog-footer flex flex-wrap justify-end gap-3 border-t border-line">
        {phase === "uploading" ? <button type="button" className="btn btn-ghost" onClick={() => controller.current?.abort()}>{t(K.stopUpload)}</button>
          : <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => dialog.current?.close()}>{t(K.cancel)}</button>}
        <button type="submit" className="btn btn-primary" disabled={busy || reading || (mode === "json" && (!json.preview || !!json.error))}>
          <FileUp className="h-4 w-4" aria-hidden />{t(K.add)}
        </button>
      </footer>
    </form>
  </dialog>;
}
