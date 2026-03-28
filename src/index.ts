#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HEVY_API_BASE = "https://api.hevyapp.com";

function getApiKey(): string {
  const key = process.env.HEVY_API_KEY;
  if (!key) throw new Error("HEVY_API_KEY environment variable is required");
  return key;
}

function getContextPath(): string {
  if (process.env.HEVY_CONTEXT_PATH) return process.env.HEVY_CONTEXT_PATH;
  return path.join(os.homedir(), ".hevy-mcp", "context.json");
}

// ---------------------------------------------------------------------------
// Hevy API
// ---------------------------------------------------------------------------

async function hevyFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${HEVY_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "api-key": getApiKey(),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hevy API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/** Fetch every page of a paginated endpoint and return all items. */
async function fetchAllPages<T>(
  endpoint: string,
  itemKey: string,
  maxPages = 20
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const data = (await hevyFetch(`${endpoint}${sep}page=${page}&pageSize=10`)) as Record<string, unknown>;
    const items = (data[itemKey] as T[]) ?? [];
    all.push(...items);
    const pageCount = (data.page_count as number) ?? 1;
    if (page >= pageCount) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Context persistence
// ---------------------------------------------------------------------------

interface UserContext {
  goals?: string;
  experience_level?: string;
  equipment?: string[];
  injuries?: string;
  schedule?: string;
  preferences?: string;
  notes?: string;
  updated_at?: string;
}

async function readContext(): Promise<UserContext> {
  try {
    const raw = await fs.readFile(getContextPath(), "utf-8");
    return JSON.parse(raw) as UserContext;
  } catch {
    return {};
  }
}

async function writeContext(ctx: UserContext): Promise<void> {
  const filePath = getContextPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ ...ctx, updated_at: new Date().toISOString() }, null, 2));
}

function formatContext(ctx: UserContext): string {
  if (Object.keys(ctx).length === 0) return "No context saved yet.";
  const lines = [
    ctx.goals && `Goals: ${ctx.goals}`,
    ctx.experience_level && `Experience level: ${ctx.experience_level}`,
    ctx.equipment?.length && `Equipment: ${ctx.equipment.join(", ")}`,
    ctx.injuries && `Injuries/limitations: ${ctx.injuries}`,
    ctx.schedule && `Schedule: ${ctx.schedule}`,
    ctx.preferences && `Preferences: ${ctx.preferences}`,
    ctx.notes && `Notes: ${ctx.notes}`,
    ctx.updated_at && `Last updated: ${ctx.updated_at}`,
  ].filter(Boolean);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "hevy-mcp", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const tools = [
  // --- Workouts ---
  {
    name: "get_workouts",
    description:
      "Get a paginated list of workouts from the user's Hevy account. Use this to review workout history or analyse training patterns.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page, max 10 (default: 5)" },
      },
    },
  },
  {
    name: "get_all_workouts",
    description:
      "Fetch all workouts across every page automatically (up to 200). Use this when you need a complete picture of training history for analysis or progress tracking.",
    inputSchema: {
      type: "object",
      properties: {
        max_pages: { type: "number", description: "Maximum pages to fetch (default: 20, each page has 10 workouts)" },
      },
    },
  },
  {
    name: "get_workout",
    description: "Get the full details of a single workout by its ID, including all exercises and sets.",
    inputSchema: {
      type: "object",
      properties: {
        workoutId: { type: "string", description: "The ID of the workout" },
      },
      required: ["workoutId"],
    },
  },
  {
    name: "get_workout_count",
    description: "Get the total number of workouts logged on the account.",
    inputSchema: { type: "object", properties: {} },
  },
  // --- Routines ---
  {
    name: "get_routines",
    description:
      "Get a paginated list of the user's workout routines. Use this to review existing plans before giving feedback or making changes.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page, max 10 (default: 5)" },
      },
    },
  },
  {
    name: "get_all_routines",
    description:
      "Fetch every routine across all pages automatically. Use this when you need a complete picture of the user's training programme before giving feedback or creating a new plan.",
    inputSchema: {
      type: "object",
      properties: {
        max_pages: { type: "number", description: "Maximum pages to fetch (default: 20)" },
      },
    },
  },
  {
    name: "get_routine",
    description: "Get the full details of a single routine by its ID, including all exercises, sets, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string", description: "The ID of the routine" },
      },
      required: ["routineId"],
    },
  },
  {
    name: "create_routine",
    description:
      "Create a new workout routine in the user's Hevy account. You MUST call get_exercise_templates first to obtain valid exercise_template_ids.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Routine title" },
        notes: { type: "string", description: "General notes for the routine" },
        folder_id: { type: "number", description: "Optional folder ID (omit for default 'My Routines')" },
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              exercise_template_id: { type: "string" },
              notes: { type: "string" },
              rest_seconds: { type: "number" },
              sets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["warmup", "normal", "failure", "dropset"] },
                    weight_kg: { type: "number" },
                    reps: { type: "number" },
                    distance_meters: { type: "number" },
                    duration_seconds: { type: "number" },
                    rep_range: {
                      type: "object",
                      properties: { start: { type: "number" }, end: { type: "number" } },
                    },
                  },
                  required: ["type"],
                },
              },
            },
            required: ["exercise_template_id", "sets"],
          },
        },
      },
      required: ["title", "exercises"],
    },
  },
  {
    name: "update_routine",
    description: "Update an existing workout routine. Replaces all exercises with the new list provided.",
    inputSchema: {
      type: "object",
      properties: {
        routineId: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              exercise_template_id: { type: "string" },
              notes: { type: "string" },
              rest_seconds: { type: "number" },
              sets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["warmup", "normal", "failure", "dropset"] },
                    weight_kg: { type: "number" },
                    reps: { type: "number" },
                    distance_meters: { type: "number" },
                    duration_seconds: { type: "number" },
                    rep_range: {
                      type: "object",
                      properties: { start: { type: "number" }, end: { type: "number" } },
                    },
                  },
                  required: ["type"],
                },
              },
            },
            required: ["exercise_template_id", "sets"],
          },
        },
      },
      required: ["routineId", "title", "exercises"],
    },
  },
  // --- Exercise templates ---
  {
    name: "get_exercise_templates",
    description:
      "Browse available exercise templates. Use this to find valid exercise_template_ids before creating or updating routines. Supports up to 100 results per page.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "Page number (default: 1)" },
        pageSize: { type: "number", description: "Items per page, max 100 (default: 50)" },
      },
    },
  },
  {
    name: "get_exercise_template",
    description: "Get full details for a single exercise template by ID.",
    inputSchema: {
      type: "object",
      properties: {
        exerciseTemplateId: { type: "string" },
      },
      required: ["exerciseTemplateId"],
    },
  },
  // --- Exercise history ---
  {
    name: "get_exercise_history",
    description:
      "Get the history of a specific exercise across all workouts. Use this to track progress and identify PRs for a given movement.",
    inputSchema: {
      type: "object",
      properties: {
        exerciseTemplateId: { type: "string" },
        start_date: { type: "string", description: "ISO 8601 start date filter (e.g. '2024-01-01T00:00:00Z')" },
        end_date: { type: "string", description: "ISO 8601 end date filter" },
      },
      required: ["exerciseTemplateId"],
    },
  },
  // --- Routine folders ---
  {
    name: "get_routine_folders",
    description: "Get a paginated list of routine folders.",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
      },
    },
  },
  {
    name: "create_routine_folder",
    description: "Create a new folder to organise routines.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
    },
  },
  // --- User ---
  {
    name: "get_user_info",
    description: "Get the authenticated user's Hevy profile.",
    inputSchema: { type: "object", properties: {} },
  },
  // --- Context ---
  {
    name: "save_context",
    description:
      "Save the user's fitness context (goals, experience level, equipment, injuries, schedule, preferences, notes). This persists between conversations so you don't have to ask every time. Call this whenever you learn something new about the user.",
    inputSchema: {
      type: "object",
      properties: {
        goals: { type: "string", description: "Fitness goals (e.g. 'build muscle', 'lose fat', 'run a 5k')" },
        experience_level: {
          type: "string",
          enum: ["beginner", "intermediate", "advanced"],
          description: "Training experience level",
        },
        equipment: {
          type: "array",
          items: { type: "string" },
          description: "Available equipment (e.g. ['barbell', 'dumbbells', 'pull-up bar'])",
        },
        injuries: { type: "string", description: "Any injuries or physical limitations" },
        schedule: { type: "string", description: "Preferred training schedule (e.g. '4 days/week, Mon/Tue/Thu/Fri')" },
        preferences: { type: "string", description: "Any other training preferences" },
        notes: { type: "string", description: "Free-form notes" },
      },
    },
  },
  {
    name: "get_context",
    description:
      "Retrieve the saved fitness context for this user. Always call this at the start of a conversation to personalise your responses.",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ---- Workouts ----
      case "get_workouts": {
        const { page = 1, pageSize = 5 } = (args ?? {}) as { page?: number; pageSize?: number };
        const data = await hevyFetch(`/v1/workouts?page=${page}&pageSize=${pageSize}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_all_workouts": {
        const { max_pages = 20 } = (args ?? {}) as { max_pages?: number };
        const workouts = await fetchAllPages("/v1/workouts", "workouts", max_pages);
        return {
          content: [{ type: "text", text: JSON.stringify({ total: workouts.length, workouts }, null, 2) }],
        };
      }

      case "get_workout": {
        const { workoutId } = args as { workoutId: string };
        const data = await hevyFetch(`/v1/workouts/${workoutId}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_workout_count": {
        const data = await hevyFetch("/v1/workouts/count");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- Routines ----
      case "get_routines": {
        const { page = 1, pageSize = 5 } = (args ?? {}) as { page?: number; pageSize?: number };
        const data = await hevyFetch(`/v1/routines?page=${page}&pageSize=${pageSize}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_all_routines": {
        const { max_pages = 20 } = (args ?? {}) as { max_pages?: number };
        const routines = await fetchAllPages("/v1/routines", "routines", max_pages);
        return {
          content: [{ type: "text", text: JSON.stringify({ total: routines.length, routines }, null, 2) }],
        };
      }

      case "get_routine": {
        const { routineId } = args as { routineId: string };
        const data = await hevyFetch(`/v1/routines/${routineId}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_routine": {
        const { title, notes, folder_id, exercises } = args as {
          title: string;
          notes?: string;
          folder_id?: number;
          exercises: Array<{
            exercise_template_id: string;
            notes?: string;
            rest_seconds?: number;
            sets: Array<{
              type: string;
              weight_kg?: number;
              reps?: number;
              distance_meters?: number;
              duration_seconds?: number;
              rep_range?: { start: number; end: number };
            }>;
          }>;
        };
        const body = {
          routine: {
            title,
            notes: notes ?? "",
            folder_id: folder_id ?? null,
            exercises: exercises.map((ex) => ({
              exercise_template_id: ex.exercise_template_id,
              superset_id: null,
              rest_seconds: ex.rest_seconds ?? 90,
              notes: ex.notes ?? "",
              sets: ex.sets.map((s) => ({
                type: s.type,
                weight_kg: s.weight_kg ?? null,
                reps: s.reps ?? null,
                distance_meters: s.distance_meters ?? null,
                duration_seconds: s.duration_seconds ?? null,
                ...(s.rep_range ? { rep_range: s.rep_range } : {}),
              })),
            })),
          },
        };
        const data = await hevyFetch("/v1/routines", { method: "POST", body: JSON.stringify(body) });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "update_routine": {
        const { routineId, title, notes, exercises } = args as {
          routineId: string;
          title: string;
          notes?: string;
          exercises: Array<{
            exercise_template_id: string;
            notes?: string;
            rest_seconds?: number;
            sets: Array<{
              type: string;
              weight_kg?: number;
              reps?: number;
              distance_meters?: number;
              duration_seconds?: number;
              rep_range?: { start: number; end: number };
            }>;
          }>;
        };
        const body = {
          routine: {
            title,
            notes: notes ?? null,
            exercises: exercises.map((ex) => ({
              exercise_template_id: ex.exercise_template_id,
              superset_id: null,
              rest_seconds: ex.rest_seconds ?? 90,
              notes: ex.notes ?? "",
              sets: ex.sets.map((s) => ({
                type: s.type,
                weight_kg: s.weight_kg ?? null,
                reps: s.reps ?? null,
                distance_meters: s.distance_meters ?? null,
                duration_seconds: s.duration_seconds ?? null,
                ...(s.rep_range ? { rep_range: s.rep_range } : {}),
              })),
            })),
          },
        };
        const data = await hevyFetch(`/v1/routines/${routineId}`, { method: "PUT", body: JSON.stringify(body) });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- Exercise templates ----
      case "get_exercise_templates": {
        const { page = 1, pageSize = 50 } = (args ?? {}) as { page?: number; pageSize?: number };
        const data = await hevyFetch(`/v1/exercise_templates?page=${page}&pageSize=${pageSize}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "get_exercise_template": {
        const { exerciseTemplateId } = args as { exerciseTemplateId: string };
        const data = await hevyFetch(`/v1/exercise_templates/${exerciseTemplateId}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- Exercise history ----
      case "get_exercise_history": {
        const { exerciseTemplateId, start_date, end_date } = args as {
          exerciseTemplateId: string;
          start_date?: string;
          end_date?: string;
        };
        const params = new URLSearchParams();
        if (start_date) params.set("start_date", start_date);
        if (end_date) params.set("end_date", end_date);
        const query = params.toString() ? `?${params.toString()}` : "";
        const data = await hevyFetch(`/v1/exercise_history/${exerciseTemplateId}${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- Routine folders ----
      case "get_routine_folders": {
        const { page = 1, pageSize = 5 } = (args ?? {}) as { page?: number; pageSize?: number };
        const data = await hevyFetch(`/v1/routine_folders?page=${page}&pageSize=${pageSize}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      case "create_routine_folder": {
        const { title } = args as { title: string };
        const data = await hevyFetch("/v1/routine_folders", {
          method: "POST",
          body: JSON.stringify({ routine_folder: { title } }),
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- User ----
      case "get_user_info": {
        const data = await hevyFetch("/v1/user/info");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      // ---- Context ----
      case "save_context": {
        const incoming = (args ?? {}) as Partial<UserContext>;
        const existing = await readContext();
        const merged: UserContext = { ...existing, ...incoming };
        await writeContext(merged);
        return { content: [{ type: "text", text: `Context saved.\n\n${formatContext(merged)}` }] };
      }

      case "get_context": {
        const ctx = await readContext();
        return { content: [{ type: "text", text: formatContext(ctx) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const RESOURCES = [
  {
    uri: "hevy://context",
    name: "User fitness context",
    description: "Saved fitness goals, experience level, equipment, injuries, schedule, and preferences.",
    mimeType: "text/plain",
  },
  {
    uri: "hevy://user",
    name: "User profile",
    description: "Hevy account profile information.",
    mimeType: "application/json",
  },
  {
    uri: "hevy://routines",
    name: "All routines",
    description: "Every workout routine saved in the account.",
    mimeType: "application/json",
  },
  {
    uri: "hevy://workouts/recent",
    name: "Recent workouts",
    description: "The 10 most recent logged workouts.",
    mimeType: "application/json",
  },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case "hevy://context": {
      const ctx = await readContext();
      return { contents: [{ uri, mimeType: "text/plain", text: formatContext(ctx) }] };
    }

    case "hevy://user": {
      const data = await hevyFetch("/v1/user/info");
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    }

    case "hevy://routines": {
      const routines = await fetchAllPages("/v1/routines", "routines");
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ total: routines.length, routines }, null, 2) }],
      };
    }

    case "hevy://workouts/recent": {
      const data = await hevyFetch("/v1/workouts?page=1&pageSize=10");
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }] };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const PROMPTS = [
  {
    name: "analyse_routines",
    description: "Review all routines and identify muscle imbalances, missing movements, or improvements.",
  },
  {
    name: "create_workout_plan",
    description: "Build a personalised workout plan based on the user's saved goals and equipment.",
    arguments: [
      { name: "days_per_week", description: "How many days per week to train", required: false },
      { name: "focus", description: "Training focus (e.g. strength, hypertrophy, cardio)", required: false },
    ],
  },
  {
    name: "progress_report",
    description: "Generate a progress report from recent workout history.",
    arguments: [
      { name: "weeks", description: "Number of weeks to look back (default: 4)", required: false },
    ],
  },
  {
    name: "routine_feedback",
    description: "Get detailed feedback on a specific routine.",
    arguments: [
      { name: "routine_id", description: "The ID of the routine to review", required: true },
    ],
  },
];

server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;

  switch (name) {
    case "analyse_routines": {
      const [routines, ctx] = await Promise.all([
        fetchAllPages("/v1/routines", "routines"),
        readContext(),
      ]);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Please analyse my Hevy workout routines in detail.",
                "",
                "## My fitness context",
                formatContext(ctx),
                "",
                "## My routines",
                JSON.stringify(routines, null, 2),
                "",
                "Please identify:",
                "- Muscle group imbalances (e.g. too much push, not enough pull)",
                "- Any major movement patterns that are missing",
                "- Volume and frequency across muscle groups",
                "- Specific suggestions to improve each routine",
                "- Overall programme structure feedback",
              ].join("\n"),
            },
          },
        ],
      };
    }

    case "create_workout_plan": {
      const daysPerWeek = promptArgs?.days_per_week ?? "not specified";
      const focus = promptArgs?.focus ?? "general fitness";
      const [ctx, exercisePage] = await Promise.all([
        readContext(),
        hevyFetch("/v1/exercise_templates?page=1&pageSize=100") as Promise<{ exercise_templates: unknown[] }>,
      ]);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Please create a complete workout plan for me and save it to Hevy using the create_routine tool.",
                "",
                "## My fitness context",
                formatContext(ctx),
                "",
                `## Requested training days per week: ${daysPerWeek}`,
                `## Training focus: ${focus}`,
                "",
                "## Available exercise templates (first 100)",
                JSON.stringify(exercisePage.exercise_templates, null, 2),
                "",
                "Instructions:",
                "- Design a balanced programme that matches my goals and equipment",
                "- Use realistic sets, reps, and weights appropriate for my experience level",
                "- Add helpful notes to each exercise",
                "- Call create_routine for each day to save it directly to my Hevy account",
                "- Confirm each routine was created successfully",
              ].join("\n"),
            },
          },
        ],
      };
    }

    case "progress_report": {
      const weeks = parseInt(promptArgs?.weeks ?? "4", 10);
      const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
      const [workouts, ctx] = await Promise.all([
        fetchAllPages("/v1/workouts", "workouts"),
        readContext(),
      ]);
      const recent = (workouts as Array<{ start_time?: string }>).filter(
        (w) => w.start_time && w.start_time >= since
      );
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Please generate a detailed progress report for the last ${weeks} weeks.`,
                "",
                "## My fitness context",
                formatContext(ctx),
                "",
                `## Workouts in the last ${weeks} weeks (${recent.length} sessions)`,
                JSON.stringify(recent, null, 2),
                "",
                "Please cover:",
                "- Training frequency and consistency",
                "- Volume trends per muscle group",
                "- Any notable PRs or strength improvements",
                "- Recovery patterns (gaps between sessions)",
                "- Specific achievements to celebrate",
                "- Areas to focus on going forward",
              ].join("\n"),
            },
          },
        ],
      };
    }

    case "routine_feedback": {
      const routineId = promptArgs?.routine_id;
      if (!routineId) throw new Error("routine_id argument is required");
      const [routineData, ctx] = await Promise.all([
        hevyFetch(`/v1/routines/${routineId}`),
        readContext(),
      ]);
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                "Please give me detailed feedback on this workout routine.",
                "",
                "## My fitness context",
                formatContext(ctx),
                "",
                "## Routine",
                JSON.stringify(routineData, null, 2),
                "",
                "Please cover:",
                "- Exercise selection and whether it suits my goals",
                "- Set and rep ranges — are they appropriate?",
                "- Exercise order and supersets",
                "- Rest periods",
                "- Missing exercises or movements to consider adding",
                "- Anything to remove or swap out",
                "- Overall rating and top 3 action items",
              ].join("\n"),
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hevy MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
