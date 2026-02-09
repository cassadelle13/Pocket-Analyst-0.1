"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Text, Title, Badge, Select, SelectItem, TextInput, Button } from "@tremor/react";
import { RequireRole } from "../../../components/auth";

type QueryAuditStatus = "ok" | "error";

type QueryAuditRow = {
  id: string;
  created_at: string;
  connection_id: string | null;
  connection_name: string | null;
  db_type: string | null;
  role: string | null;
  sql_preview: string | null;
  status: QueryAuditStatus;
  duration_ms: number | null;
  row_count: number | null;
  error_message: string | null;
};

export default function DataTalkAuditPage() {
  const [rows, setRows] = useState<QueryAuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<QueryAuditStatus | "">("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [limit, setLimit] = useState<number>(100);

  const filtered = useMemo(() => {
    const q = connectionId.trim();
    if (!q) return rows;
    return rows.filter((r) => (r.connection_id ?? "").includes(q) || (r.connection_name ?? "").toLowerCase().includes(q.toLowerCase()));
  }, [rows, connectionId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set("status", status);
      if (connectionId.trim()) params.set("connectionId", connectionId.trim());

      const res = await fetch(`/api/datatalk/audit?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load audit");
      setRows(Array.isArray(json?.data) ? (json.data as QueryAuditRow[]) : []);
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Failed to load audit");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/home">
      <div className="min-h-screen bg-slate-950">
        <div className="px-8 py-8 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-white">DataTalk Audit</h1>
              <p className="mt-2 text-slate-300">Query executions recorded by control-plane.</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge color="slate">rows: {filtered.length}</Badge>
              <Button onClick={load} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </div>

          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
            <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Text className="text-slate-300 mb-2">Status</Text>
                <Select value={status} onValueChange={(v) => setStatus(String(v) as any)}>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="ok">ok</SelectItem>
                  <SelectItem value="error">error</SelectItem>
                </Select>
              </div>
              <div>
                <Text className="text-slate-300 mb-2">Connection</Text>
                <TextInput value={connectionId} onChange={(e) => setConnectionId(e.target.value)} placeholder="id or name" />
              </div>
              <div>
                <Text className="text-slate-300 mb-2">Limit</Text>
                <TextInput value={String(limit)} onChange={(e) => setLimit(Number(e.target.value || "100"))} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={load} disabled={loading}>
                  Apply
                </Button>
              </div>
            </div>
          </Card>

          {error && (
            <Card className="bg-red-950/20 border border-red-500/30 rounded-2xl">
              <div className="p-5">
                <Text className="text-red-300">{error}</Text>
              </div>
            </Card>
          )}

          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl overflow-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">Time</th>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">Status</th>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">Connection</th>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">Role</th>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">Rows</th>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">Duration</th>
                  <th className="px-3 py-2 text-slate-200 font-semibold border-b border-white/10">SQL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} className={idx % 2 === 0 ? "bg-white/0" : "bg-white/5"}>
                    <td className="px-3 py-2 text-slate-200 border-b border-white/5 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 border-b border-white/5">
                      <span className={r.status === "ok" ? "text-emerald-300" : "text-red-300"}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-200 border-b border-white/5">
                      <div className="space-y-0.5">
                        <div className="font-mono">{r.connection_name ?? "(manual)"}</div>
                        <div className="text-slate-400">{r.db_type ?? ""}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-200 border-b border-white/5">{r.role ?? ""}</td>
                    <td className="px-3 py-2 text-slate-200 border-b border-white/5">{r.row_count ?? ""}</td>
                    <td className="px-3 py-2 text-slate-200 border-b border-white/5">{r.duration_ms ?? ""}</td>
                    <td className="px-3 py-2 text-slate-200 border-b border-white/5">
                      <div className="max-w-[640px] whitespace-pre-wrap break-words font-mono text-[11px]">
                        {r.sql_preview ?? ""}
                        {r.error_message ? `\n\nERROR: ${r.error_message}` : ""}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </RequireRole>
  );
}
