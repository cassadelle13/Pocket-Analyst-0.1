"use client";

import { useRole } from "../../providers";
import { useDemoMode } from "../../context/DemoContext";
import { Beaker } from "lucide-react";

export function Header() {
  const { role, setRole } = useRole();
  const { isDemoMode, toggleDemoMode } = useDemoMode();

  const handleDemoToggle = () => {
    console.log('[Header] Demo Mode toggle clicked, current:', isDemoMode);
    try {
      toggleDemoMode();
      console.log('[Header] Demo Mode toggled successfully');
    } catch (error) {
      console.error('[Header] Demo Mode toggle error:', error);
    }
  };

  const handleRoleChange = (newRole: "business" | "data-admin") => {
    console.log('[Header] Role change clicked:', newRole, 'current:', role);
    try {
      setRole(newRole);
      console.log('[Header] Role changed successfully');
    } catch (error) {
      console.error('[Header] Role change error:', error);
    }
  };

  return (
    <div className="px-8 py-4 backdrop-blur-xl bg-white/5 border-b border-white/10 flex items-center justify-end relative z-50">
      <div className="flex items-center gap-3">
        {/* Demo Mode Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDemoToggle();
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${
            isDemoMode
              ? "bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-lg shadow-amber-500/20"
              : "bg-white/5 text-slate-300 border-white/10 hover:text-white hover:border-white/20"
          }`}
        >
          <Beaker className={`w-4 h-4 ${isDemoMode ? "animate-pulse" : ""}`} />
          {isDemoMode ? "Demo" : "Live"}
        </button>

        {/* Role Switcher */}
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRoleChange("business");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              role === "business" ? "bg-lime-400/15 text-lime-400" : "text-slate-300 hover:text-white"
            }`}
          >
            Business
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRoleChange("data-admin");
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              role === "data-admin" ? "bg-lime-400/15 text-lime-400" : "text-slate-300 hover:text-white"
            }`}
          >
            Data Admin
          </button>
        </div>

        {/* User Avatar */}
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-all group"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shadow-lg">
            U1
          </div>
          <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
            user 1
          </span>
        </button>
      </div>
    </div>
  );
}
