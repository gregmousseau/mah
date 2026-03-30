import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const MAH_ROOT = join(process.cwd(), "..");
const SPRINTS_DIR = join(MAH_ROOT, ".mah", "sprints");
const PROJECTS_DIR = join(MAH_ROOT, ".mah", "projects");

interface CreateDraftRequest {
  name: string;
  task: string;
  projectId?: string;
}

export async function POST(request: Request) {
  try {
    const body: CreateDraftRequest = await request.json();
    const { name, task, projectId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Sprint name is required" }, { status: 400 });
    }

    if (!task || !task.trim()) {
      return NextResponse.json({ error: "Task description is required" }, { status: 400 });
    }

    // Load project repo if projectId is provided
    let projectRepo = ".";
    if (projectId) {
      const projectPath = join(PROJECTS_DIR, `${projectId}.json`);
      if (existsSync(projectPath)) {
        try {
          const projectData = JSON.parse(readFileSync(projectPath, "utf-8"));
          if (projectData.repo) {
            projectRepo = projectData.repo;
          }
        } catch (err) {
          console.warn(`Failed to load project ${projectId}:`, err);
        }
      }
    }

    // Generate draft ID
    const id = `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const sprintDir = join(SPRINTS_DIR, id);

    if (!existsSync(sprintDir)) {
      mkdirSync(sprintDir, { recursive: true });
    }

    // Create minimal draft contract
    const contract = {
      id,
      name: name.trim(),
      task: task.trim(),
      projectId: projectId || undefined,
      status: "draft",
      sprintType: "code",
      devBrief: {
        repo: projectRepo,
        constraints: ["Follow existing code patterns and conventions"],
        definitionOfDone: [],
      },
      qaBrief: {
        tier: "targeted",
        testUrl: "",
        testFocus: [],
        passCriteria: [],
        knownLimitations: [],
      },
      graders: [],
      iterations: [],
      createdAt: new Date().toISOString(),
    };

    writeFileSync(join(sprintDir, "contract.json"), JSON.stringify(contract, null, 2));

    return NextResponse.json({ success: true, id, contract });
  } catch (err) {
    console.error("Board create-draft error:", err);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }
}
