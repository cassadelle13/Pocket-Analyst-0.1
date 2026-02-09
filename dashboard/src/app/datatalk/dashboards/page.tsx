"use client";

import { useState } from "react";
import { Card, Text, Title, TextInput, Button } from "@tremor/react";
import { RequireRole } from "../../../components/auth";

export default function DataTalkDashboardsPage() {
  const [dashboardId, setDashboardId] = useState<string>("1");
  const [embedUrl, setEmbedUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setEmbedUrl("");

    try {
      const id = dashboardId.trim();
      if (!id) throw new Error("Dashboard ID is required");

      const res = await fetch(`/api/metabase/embed/dashboard/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate embed URL");
      setEmbedUrl(String(json?.url ?? ""));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/home">
      <div className="min-h-screen bg-slate-950">
        <div className="px-8 py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">DataTalk Dashboards</h1>
            <p className="mt-2 text-slate-300">Embedded Metabase dashboards (static embed).</p>
          </div>

          <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl">
            <div className="p-6 grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-2">
                <Text className="text-slate-300 mb-2">Dashboard ID</Text>
                <TextInput value={dashboardId} onChange={(e) => setDashboardId(e.target.value)} placeholder="e.g. 1" />
              </div>
              <div className="md:col-span-2">
                <Button className="w-full" onClick={load} disabled={loading}>
                  {loading ? "Generating..." : "Open"}
                </Button>
              </div>
              {error && (
                <div className="md:col-span-6">
                  <Text className="text-red-300">{error}</Text>
                </div>
              )}
            </div>
          </Card>

          {embedUrl && (
            <Card className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden">
              <div className="p-6">
                <Title className="text-white">Embedded</Title>
                <Text className="text-slate-300 mt-2">If you see blank, check Metabase is configured and the secret matches.</Text>
              </div>
              <div className="h-[75vh] border-t border-white/10">
                <iframe
                  title="metabase-dashboard"
                  src={embedUrl}
                  className="w-full h-full"
                  allow="fullscreen"
                />
              </div>
            </Card>
          )}
        </div>
      </div>
    </RequireRole>
  );
}
