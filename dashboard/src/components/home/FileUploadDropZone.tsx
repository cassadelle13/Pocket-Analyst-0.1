"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";

type SheetModalState = {
  file: File;
  sheets: string[];
};

export type UploadSuccessPayload = {
  connectionId: string;
  tableKey: string;
  displayName: string;
  rowCount: number;
};

type FileUploadDropZoneProps = {
  onUploadSuccess?: (payload: UploadSuccessPayload) => void;
  onEnsureSlot?: (connectionId: string, connectionName: string) => void;
};

export function FileUploadDropZone({ onUploadSuccess, onEnsureSlot }: FileUploadDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetModal, setSheetModal] = useState<SheetModalState | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");

  const uploadDataset = useCallback(
    async (file: File, sheet: string | null) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (sheet) fd.append("sheet", sheet);
        const res = await fetch("/api/uploads/dataset", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(String(json?.error ?? "Upload failed"));
        }
        const d = json?.data;
        if (!d?.connectionId || !d?.tableKey) {
          throw new Error("Invalid server response");
        }
        setMessage(
          `Imported ${d.rowCount ?? 0} rows → ${d.tableKey}. Turn on the Local Postgres card (green indicator) to browse.`
        );
        onUploadSuccess?.({
          connectionId: String(d.connectionId),
          tableKey: String(d.tableKey),
          displayName: String(d.displayName ?? file.name),
          rowCount: Number(d.rowCount ?? 0),
        });
        onEnsureSlot?.(String(d.connectionId), "Local Postgres");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onEnsureSlot, onUploadSuccess]
  );

  const handleFileChosen = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const name = file.name.toLowerCase();
      setError(null);
      setMessage(null);

      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        setBusy(true);
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/uploads/sheets", { method: "POST", body: fd });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(String(json?.error ?? "Could not read sheets"));
          }
          const sheets: string[] = Array.isArray(json?.data?.sheets) ? json.data.sheets : [];
          if (!sheets.length) throw new Error("Workbook has no sheets");
          setSheetModal({ file, sheets });
          setSelectedSheet(sheets[0] ?? "");
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Failed to list sheets");
        } finally {
          setBusy(false);
        }
        return;
      }

      if (name.endsWith(".csv")) {
        await uploadDataset(file, null);
        return;
      }

      setError("Use .csv, .xlsx, or .xls");
    },
    [uploadDataset]
  );

  const confirmSheet = useCallback(async () => {
    if (!sheetModal || !selectedSheet) return;
    const f = sheetModal.file;
    setSheetModal(null);
    await uploadDataset(f, selectedSheet);
  }, [sheetModal, selectedSheet, uploadDataset]);

  return (
    <div className="rounded-3xl border border-dashed border-emerald-500/35 bg-emerald-950/10 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
          <Upload className="h-6 w-6" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Upload table (CSV / Excel)</div>
          <div className="mt-1 text-xs text-slate-400">
            Data is stored in PostgreSQL schema <span className="font-mono text-slate-300">pa_upload</span>. Use your
            Local Postgres connection in the chart builder.
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            void handleFileChosen(f);
          }}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {busy ? "Working…" : "Choose file"}
          </button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!busy) inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (busy) return;
            const f = e.dataTransfer.files?.[0] ?? null;
            void handleFileChosen(f);
          }}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-xs text-slate-400"
        >
          Or drag and drop a file here
        </div>

        {message && <div className="text-xs text-emerald-200/90">{message}</div>}
        {error && <div className="text-xs text-rose-300">{error}</div>}
      </div>

      {sheetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-xl">
            <div className="text-sm font-semibold text-white">Choose worksheet</div>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
              {sheetModal.sheets.map((s) => (
                <label
                  key={s}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10"
                >
                  <input
                    type="radio"
                    name="sheet"
                    value={s}
                    checked={selectedSheet === s}
                    onChange={() => setSelectedSheet(s)}
                  />
                  <span className="text-sm text-slate-200">{s}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
                onClick={() => setSheetModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedSheet || busy}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => void confirmSheet()}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
