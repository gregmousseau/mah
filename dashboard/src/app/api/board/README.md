# Board Draft Management API

This directory contains API endpoints for creating and managing sprint drafts directly from the board interface.

## Endpoints

### POST /api/board/create-draft
Creates a minimal draft sprint with just a name, task description, and optional project.

**Request Body:**
```json
{
  "name": "Sprint name",
  "task": "Detailed task description",
  "projectId": "optional-project-id"
}
```

**Response:**
```json
{
  "success": true,
  "id": "draft-abc123def",
  "contract": { /* full SprintContract object */ }
}
```

### POST /api/board/plan-sprint
Takes a draft sprint ID, reads its task description, calls the planner to generate a refined sprint plan (agent assignment, complexity, QA tier), and updates the draft contract in place.

**Request Body:**
```json
{
  "sprintId": "draft-abc123def"
}
```

**Response:**
```json
{
  "success": true,
  "contract": { /* updated SprintContract with planning results */ },
  "plannerOutput": "Planner's reasoning..."
}
```

### POST /api/board/update-draft
Updates a draft sprint's fields (name, task, agent, project, etc.) for inline editing.

**Request Body:**
```json
{
  "sprintId": "draft-abc123def",
  "updates": {
    "name": "Updated name",
    "task": "Updated task description",
    "projectId": "new-project-id",
    "sprintType": "frontend",
    "agentConfig": {
      "generator": { "agentId": "frontend-dev", "agentName": "Frankie" },
      "evaluator": { "agentId": "qa", "agentName": "Quinn" }
    },
    "qaBrief": {
      "tier": "full"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "contract": { /* updated SprintContract */ }
}
```

### DELETE /api/board/draft/[id]
Deletes a draft sprint.

**Request:**
```
DELETE /api/board/draft/draft-abc123def
```

**Response:**
```json
{
  "success": true,
  "message": "Draft deleted successfully"
}
```

## Integration with Existing Endpoints

These endpoints are designed to work with the existing sprint management system:

- **POST /api/builder/negotiate** - Can be used to negotiate dev/qa briefs for drafts created here
- **POST /api/builder/save** - Can save/schedule drafts with status updates
- **POST /api/sprints/run** - Can run drafts (will auto-assign sequential numeric ID)
- **GET /api/builder/drafts** - Lists all drafts including those created via board API

## File Storage

Drafts are stored in `.mah/sprints/[draft-id]/contract.json` with status "draft". When a draft is run via `/api/sprints/run`, it gets assigned a sequential numeric ID (001, 002, etc.) and the directory is renamed to `NNN-slugified-name`.
