"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Database,
  Settings,
  Bot,
  ChevronDown,
  FolderKanban,
  Zap,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
}

const projects: Project[] = [
  { id: "1", name: "Mobile App" },
  { id: "2", name: "Web Platform" },
  { id: "3", name: "Marketing Site" },
];

const menuItems = [
  { name: "Analyst", href: "/dashboard", icon: Bot, isAI: true },
  { name: "Metrics", href: "/metrics", icon: TrendingUp, isAI: false },
  { name: "Events", href: "/events", icon: Database, isAI: false },
  { name: "Settings", href: "/settings", icon: Settings, isAI: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const [currentProject, setCurrentProject] = useState(projects[0]);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);

  return (
    <aside className="w-64 bg-[#0f172a] text-white min-h-screen flex flex-col border-r border-slate-800/50">
      {/* Logo */}
      <div className="p-5 border-b border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-lime-400 to-lime-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              Pocket<span className="text-lime-400">Analyst</span>
            </h1>
          </div>
        </div>
      </div>

      {/* Project Selector */}
      <div className="p-4 border-b border-slate-800/50">
        <div className="relative">
          <button
            onClick={() => setIsProjectMenuOpen(!isProjectMenuOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-200">{currentProject.name}</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 transition-transform ${
                isProjectMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isProjectMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 rounded-lg shadow-xl z-10 overflow-hidden border border-slate-700">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    setCurrentProject(project);
                    setIsProjectMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 text-left text-sm hover:bg-slate-700 transition-colors ${
                    currentProject.id === project.id
                      ? "bg-slate-700 text-lime-400"
                      : "text-slate-300"
                  }`}
                >
                  {project.name}
                </button>
              ))}
              <div className="border-t border-slate-700">
                <button className="w-full px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-700 hover:text-white transition-colors">
                  + Add Project
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? item.isAI
                        ? "bg-lime-400/10 text-lime-400 ai-glow"
                        : "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive && item.isAI ? "text-lime-400" : ""}`} />
                  <span className="text-sm font-medium">{item.name}</span>
                  {item.isAI && (
                    <span className="ml-auto text-[10px] font-semibold bg-lime-400/20 text-lime-400 px-1.5 py-0.5 rounded">
                      AI
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-sm font-semibold">R</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Ruslan</p>
            <p className="text-xs text-slate-500 truncate">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
