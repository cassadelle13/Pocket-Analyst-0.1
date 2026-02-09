"use client";

import { RequireRole } from "../../components/auth";
import { EventsTable } from "../../components/widgets";
import { CalendarIcon } from "lucide-react";

export default function EventsPage() {
  return (
    <RequireRole allow={["business", "data-admin"]} fallbackHref="/dashboard">
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 relative overflow-hidden">
        <div className="fixed inset-0">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob" />
          <div className="absolute top-0 -right-4 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000" />
        </div>

        <div className="relative z-10">
          <div className="p-8 space-y-8">
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl border border-blue-400/20">
                  <CalendarIcon className="h-8 w-8 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-white">Events</h1>
                  <p className="text-slate-300 mt-2">Latest events ingested into ClickHouse.</p>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
              <EventsTable title="Events Explorer" />
            </div>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
