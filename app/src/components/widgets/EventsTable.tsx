"use client";

import { Database, Globe, Smartphone, Zap } from "lucide-react";

interface Event {
  id: string;
  name: string;
  user: string;
  timestamp: string;
  source: "web" | "mobile" | "api";
  properties?: Record<string, string>;
}

const eventsData: Event[] = [
  { id: "1", name: "page_view", user: "user_8f3k2", timestamp: "2 min ago", source: "web", properties: { page: "/pricing" } },
  { id: "2", name: "button_click", user: "user_j29x1", timestamp: "5 min ago", source: "mobile", properties: { button: "upgrade" } },
  { id: "3", name: "purchase", user: "user_m4n8p", timestamp: "8 min ago", source: "web", properties: { plan: "pro" } },
  { id: "4", name: "signup", user: "user_q7w2e", timestamp: "12 min ago", source: "mobile" },
  { id: "5", name: "feature_used", user: "user_t5y9u", timestamp: "15 min ago", source: "api", properties: { feature: "export" } },
];

const sourceConfig = {
  web: { icon: Globe, color: "text-blue-400", bg: "bg-blue-400/10" },
  mobile: { icon: Smartphone, color: "text-purple-400", bg: "bg-purple-400/10" },
  api: { icon: Zap, color: "text-amber-400", bg: "bg-amber-400/10" },
};

interface EventsTableProps {
  title?: string;
  events?: Event[];
}

export function EventsTable({ title = "Live Events", events = eventsData }: EventsTableProps) {
  return (
    <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700/50 rounded-xl flex items-center justify-center">
            <Database className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-xs text-slate-500">Streaming from Jitsu → ClickHouse</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
          <span className="text-xs text-slate-500">28,459 today</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Properties</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {events.map((event) => {
              const source = sourceConfig[event.source];
              const SourceIcon = source.icon;
              return (
                <tr key={event.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-3">
                    <span className="font-mono text-sm text-lime-400">{event.name}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-slate-300">{event.user}</span>
                  </td>
                  <td className="px-6 py-3">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${source.bg}`}>
                      <SourceIcon className={`w-3 h-3 ${source.color}`} />
                      <span className={`text-xs font-medium ${source.color}`}>{event.source}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    {event.properties ? (
                      <span className="text-xs text-slate-500 font-mono">
                        {Object.entries(event.properties).map(([k, v]) => `${k}:${v}`).join(", ")}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="text-xs text-slate-500">{event.timestamp}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-slate-700/50 bg-slate-800/20">
        <button className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors">
          View all events →
        </button>
      </div>
    </div>
  );
}
