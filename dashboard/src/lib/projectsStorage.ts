export const PROJECTS_STORAGE_KEY = "pocketanalyst:projects";

export interface DashboardViewport {
  pan: { x: number; y: number };
  zoom: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
  nodes: any[];
  viewport?: DashboardViewport;
  semanticArtifacts?: any;
  biFilters?: any[];
}

const emitProjectsChanged = () => {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("projects:changed"));
  } catch {}
};

const safeParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const listProjects = async (): Promise<Project[]> => {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (data.ok && Array.isArray(data.projects)) {
      return data.projects;
    }
    return [];
  } catch (error) {
    console.error("Failed to list projects:", error);
    return [];
  }
};

export const saveProject = async (projectData: {
  name: string;
  description?: string;
  thumbnail?: string;
  nodes: any[];
  viewport?: DashboardViewport;
  semanticArtifacts?: any;
  biFilters?: any[];
}): Promise<string | null> => {
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: projectData.name,
        description: projectData.description || "Dashboard project",
        thumbnail: projectData.thumbnail || "",
        nodes: projectData.nodes,
        viewport: projectData.viewport,
        semantic_artifacts: projectData.semanticArtifacts,
        bi_filters: projectData.biFilters,
      }),
    });
    const data = await res.json();
    if (data.ok && data.project) {
      emitProjectsChanged();
      return data.project.id;
    }
    return null;
  } catch (error) {
    console.error("Failed to save project:", error);
    return null;
  }
};

export const loadProject = async (projectId: string): Promise<Project | null> => {
  try {
    const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`);
    const data = await res.json();
    if (data.ok && data.project) {
      const p = data.project as any;
      return {
        ...p,
        semanticArtifacts: p?.semanticArtifacts ?? p?.semantic_artifacts ?? null,
        biFilters: Array.isArray(p?.biFilters) ? p.biFilters : (Array.isArray(p?.bi_filters) ? p.bi_filters : []),
      };
    }
    return null;
  } catch (error) {
    console.error("Failed to load project:", error);
    return null;
  }
};

export const deleteProject = async (projectId: string): Promise<Project[]> => {
  try {
    const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.ok) {
      emitProjectsChanged();
    }
    return await listProjects();
  } catch (error) {
    console.error("Failed to delete project:", error);
    return await listProjects();
  }
};

export const renameProject = async (projectId: string, name: string): Promise<Project[]> => {
  try {
    const res = await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, name }),
    });
    const data = await res.json();
    if (data.ok) {
      emitProjectsChanged();
    }
    return await listProjects();
  } catch (error) {
    console.error("Failed to rename project:", error);
    return await listProjects();
  }
};

export const updateProject = async (projectId: string, patch: Partial<Project>): Promise<Project[]> => {
  try {
    const res = await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: projectId,
        name: patch.name,
        description: patch.description,
        thumbnail: patch.thumbnail,
        nodes: patch.nodes,
        viewport: patch.viewport,
        semantic_artifacts: patch.semanticArtifacts,
        bi_filters: patch.biFilters,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      emitProjectsChanged();
    }
    return await listProjects();
  } catch (error) {
    console.error("Failed to update project:", error);
    return await listProjects();
  }
};
