"use client";

import { useState, useEffect } from "react";
import { FolderOpen, Plus, Trash2, Edit3, MoreVertical } from "lucide-react";

import { listProjects, deleteProject, renameProject, type Project } from "../../lib/projectsStorage";

interface MyProjectsProps {
  onOpenProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onProjectsCountChange?: (count: number) => void;
}

export function MyProjects({ onOpenProject, onCreateProject, onProjectsCountChange }: MyProjectsProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const projects = await listProjects();
        setProjects(projects);
        onProjectsCountChange?.(projects.length);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const handler = async () => {
      const projects = await listProjects();
      setProjects(projects);
      onProjectsCountChange?.(projects.length);
    };
    window.addEventListener("projects:changed", handler);
    return () => window.removeEventListener("projects:changed", handler);
  }, [onProjectsCountChange]);

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      const updated = await deleteProject(projectId);
      setProjects(updated);
      onProjectsCountChange?.(updated.length);
      setActiveMenu(null);
    }
  };

  const handleRenameProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const project = projects.find(p => p.id === projectId);
    if (project) {
      const newName = prompt('Enter new project name:', project.name);
      if (newName && newName.trim()) {
        const updated = await renameProject(projectId, newName.trim());
        setProjects(updated);
        onProjectsCountChange?.(updated.length);
      }
    }
    setActiveMenu(null);
  };

  const renderMiniCanvas = (project: Project) => {
    const nodes = Array.isArray(project.nodes) ? project.nodes : [];
    if (nodes.length === 0) {
      return (
        <div className="absolute inset-2 bg-white/5 rounded-lg border border-white/10" />
      );
    }

    const bounds = nodes.reduce(
      (acc: { minX: number; minY: number; maxX: number; maxY: number }, n: any) => {
        const x = Number(n?.position?.x ?? 0);
        const y = Number(n?.position?.y ?? 0);
        const w = Number(n?.size?.width ?? 560);
        const h = Number(n?.size?.height ?? 360);
        return {
          minX: Math.min(acc.minX, x),
          minY: Math.min(acc.minY, y),
          maxX: Math.max(acc.maxX, x + w),
          maxY: Math.max(acc.maxY, y + h),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);

    // Thumbnail area: inset-2 inside a fixed-height container
    const innerW = 320;
    const innerH = 120;
    const scale = Math.min(innerW / bw, innerH / bh);

    const maxNodes = 12;
    const slice = nodes.slice(0, maxNodes);

    return (
      <div className="absolute inset-2 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${8}px, ${8}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {slice.map((n: any, i: number) => {
            const x = Number(n?.position?.x ?? 0) - bounds.minX;
            const y = Number(n?.position?.y ?? 0) - bounds.minY;
            const w = Number(n?.size?.width ?? 560);
            const h = Number(n?.size?.height ?? 360);

            return (
              <div
                key={String(n?.id ?? i)}
                className="absolute rounded-xl border border-white/15 bg-slate-900/70"
                style={{ left: x, top: y, width: w, height: h }}
              >
                <div className="h-8 border-b border-white/10 bg-slate-900/70" />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/10 rounded-xl w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-3">
                <div className="h-32 bg-white/10 rounded-xl"></div>
                <div className="h-4 bg-white/10 rounded w-3/4"></div>
                <div className="h-3 bg-white/10 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-2xl border border-blue-400/20">
            <FolderOpen className="h-8 w-8 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">My Projects</h2>
            <p className="text-slate-300 mt-1">Your saved dashboard projects</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCreateProject}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">
            <FolderOpen className="w-12 h-12 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No projects yet</h3>
          <p className="text-slate-400 mb-6">No dashboards yet - go to Dashboard to create your first.</p>
          <button
            type="button"
            onClick={onCreateProject}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            <Plus className="w-5 h-5" />
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer overflow-hidden"
              onClick={() => onOpenProject?.(project.id)}
            >
              {/* Project thumbnail/canvas preview */}
              <div className="h-40 bg-gradient-to-br from-slate-900 to-slate-800 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-full relative">
                    {project.thumbnail ? (
                      <div className="absolute inset-2 bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={project.thumbnail}
                          alt={project.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      renderMiniCanvas(project)
                    )}
                  </div>
                </div>
                
                {/* Action menu */}
                <div className="absolute top-2 right-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === project.id ? null : project.id);
                    }}
                    className="p-1.5 bg-black/50 backdrop-blur-sm rounded-lg text-white/80 hover:text-white hover:bg-black/60 transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  
                  {activeMenu === project.id && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl z-10">
                      <button
                        type="button"
                        onClick={(e) => handleRenameProject(project.id, e)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Project info */}
              <div className="p-4">
                <h3 className="font-semibold text-white mb-1 truncate">{project.name}</h3>
                <p className="text-sm text-slate-400 mb-3 line-clamp-2">{project.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{project.nodes?.length || 0} charts</span>
                  <span>{formatDate(project.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
