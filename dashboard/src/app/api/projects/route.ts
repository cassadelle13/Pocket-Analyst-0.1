import { NextRequest, NextResponse } from "next/server";
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  type CreateProjectInput,
  type UpdateProjectInput,
} from "../../../lib/datatalkMetaDb";

// GET /api/projects - list all projects
// GET /api/projects?id=xxx - get single project by ID
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const project = await getProjectById(id);
      if (!project) {
        return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, project });
    }

    const projects = await listProjects();
    return NextResponse.json({ ok: true, projects });
  } catch (error: any) {
    console.error("[/api/projects GET]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects - create new project
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: CreateProjectInput = {
      id: body.id || `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: body.name || "Untitled Project",
      description: body.description,
      thumbnail: body.thumbnail,
      nodes: body.nodes || [],
      viewport: body.viewport,
      semantic_artifacts: body.semantic_artifacts,
    };

    const project = await createProject(input);
    return NextResponse.json({ ok: true, project });
  } catch (error: any) {
    console.error("[/api/projects POST]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to create project" },
      { status: 500 }
    );
  }
}

// PUT /api/projects - update existing project
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id;

    if (!id) {
      return NextResponse.json({ ok: false, error: "Project ID is required" }, { status: 400 });
    }

    const input: UpdateProjectInput = {
      name: body.name,
      description: body.description,
      thumbnail: body.thumbnail,
      nodes: body.nodes,
      viewport: body.viewport,
      semantic_artifacts: body.semantic_artifacts,
    };

    const project = await updateProject(id, input);
    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, project });
  } catch (error: any) {
    console.error("[/api/projects PUT]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to update project" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects?id=xxx - delete project
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Project ID is required" }, { status: 400 });
    }

    const deleted = await deleteProject(id);
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[/api/projects DELETE]", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Failed to delete project" },
      { status: 500 }
    );
  }
}
