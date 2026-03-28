#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const HEVY_API_BASE = "https://api.hevyapp.com";

function getApiKey(): string {
  const key = process.env.HEVY_API_KEY;
  if (!key) {
    throw new Error("HEVY_API_KEY environment variable is required");
  }
  return key;
}

async function hevyFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const apiKey = getApiKey();
  const url = `${HEVY_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "api-key": apiKey,
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

const server = new Server(
  {
    name: "hevy-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  {
    name: "get_workouts",
    description:
      "Get a paginated list of workouts from the user's Hevy account. Use this to review workout history, analyze training patterns, or provide feedback on past sessions.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        pageSize: {
          type: "number",
          description: "Number of workouts per page, max 10 (default: 5)",
        },
      },
    },
  },
  {
    name: "get_workout",
    description:
      "Get the full details of a single workout by its ID, including all exercises and sets.",
    inputSchema: {
      type: "object",
      properties: {
        workoutId: {
          type: "string",
          description: "The ID of the workout",
        },
      },
      required: ["workoutId"],
    },
  },
  {
    name: "get_workout_count",
    description: "Get the total number of workouts logged on the account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_routines",
    description:
      "Get a paginated list of the user's workout routines. Use this to review existing workout plans and provide feedback or suggestions for improvement.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        pageSize: {
          type: "number",
          description: "Number of routines per page, max 10 (default: 5)",
        },
      },
    },
  },
  {
    name: "get_routine",
    description:
      "Get the full details of a single workout routine by its ID, including all exercises, sets, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        routineId: {
          type: "string",
          description: "The ID of the routine",
        },
      },
      required: ["routineId"],
    },
  },
  {
    name: "create_routine",
    description:
      "Create a new workout routine in the user's Hevy account. Use this to build personalized workout plans based on user goals, fitness level, and available equipment. You must use valid exercise_template_ids - fetch exercise templates first with get_exercise_templates.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the routine (e.g. 'Push Day A')",
        },
        notes: {
          type: "string",
          description: "General notes for the routine",
        },
        folder_id: {
          type: "number",
          description:
            "Optional folder ID to place the routine in. Omit to use the default 'My Routines' folder.",
        },
        exercises: {
          type: "array",
          description: "List of exercises in the routine",
          items: {
            type: "object",
            properties: {
              exercise_template_id: {
                type: "string",
                description: "The ID of the exercise template",
              },
              notes: {
                type: "string",
                description: "Notes for this exercise",
              },
              rest_seconds: {
                type: "number",
                description: "Rest time in seconds between sets",
              },
              sets: {
                type: "array",
                description: "Sets for this exercise",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["warmup", "normal", "failure", "dropset"],
                      description: "Set type",
                    },
                    weight_kg: {
                      type: "number",
                      description: "Weight in kilograms (null if not applicable)",
                    },
                    reps: {
                      type: "number",
                      description: "Number of reps (null if not applicable)",
                    },
                    distance_meters: {
                      type: "number",
                      description: "Distance in meters (null if not applicable)",
                    },
                    duration_seconds: {
                      type: "number",
                      description:
                        "Duration in seconds (null if not applicable)",
                    },
                    rep_range: {
                      type: "object",
                      description: "Optional rep range for the set",
                      properties: {
                        start: { type: "number" },
                        end: { type: "number" },
                      },
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
    description:
      "Update an existing workout routine. Use this to modify exercises, sets, or notes in a routine based on user feedback or to improve a training plan.",
    inputSchema: {
      type: "object",
      properties: {
        routineId: {
          type: "string",
          description: "The ID of the routine to update",
        },
        title: {
          type: "string",
          description: "New title for the routine",
        },
        notes: {
          type: "string",
          description: "Updated notes for the routine",
        },
        exercises: {
          type: "array",
          description: "Updated list of exercises (replaces existing exercises)",
          items: {
            type: "object",
            properties: {
              exercise_template_id: {
                type: "string",
                description: "The ID of the exercise template",
              },
              notes: {
                type: "string",
                description: "Notes for this exercise",
              },
              rest_seconds: {
                type: "number",
                description: "Rest time in seconds between sets",
              },
              sets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["warmup", "normal", "failure", "dropset"],
                    },
                    weight_kg: { type: "number" },
                    reps: { type: "number" },
                    distance_meters: { type: "number" },
                    duration_seconds: { type: "number" },
                    rep_range: {
                      type: "object",
                      properties: {
                        start: { type: "number" },
                        end: { type: "number" },
                      },
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
  {
    name: "get_exercise_templates",
    description:
      "Get a paginated list of available exercise templates. Use this to find valid exercise IDs when creating or updating routines. Can filter or browse by name.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        pageSize: {
          type: "number",
          description: "Number of templates per page, max 100 (default: 20)",
        },
      },
    },
  },
  {
    name: "get_exercise_template",
    description:
      "Get full details for a single exercise template by ID, including muscle groups, equipment type, and exercise type.",
    inputSchema: {
      type: "object",
      properties: {
        exerciseTemplateId: {
          type: "string",
          description: "The ID of the exercise template",
        },
      },
      required: ["exerciseTemplateId"],
    },
  },
  {
    name: "get_exercise_history",
    description:
      "Get the history of a specific exercise across all workouts. Use this to track progress, identify PRs, and provide feedback on strength development for a particular movement.",
    inputSchema: {
      type: "object",
      properties: {
        exerciseTemplateId: {
          type: "string",
          description: "The ID of the exercise template",
        },
        start_date: {
          type: "string",
          description:
            "Optional start date filter in ISO 8601 format (e.g. '2024-01-01T00:00:00Z')",
        },
        end_date: {
          type: "string",
          description:
            "Optional end date filter in ISO 8601 format (e.g. '2024-12-31T23:59:59Z')",
        },
      },
      required: ["exerciseTemplateId"],
    },
  },
  {
    name: "get_routine_folders",
    description:
      "Get a paginated list of routine folders used to organize workout routines.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        pageSize: {
          type: "number",
          description: "Number of folders per page, max 10 (default: 5)",
        },
      },
    },
  },
  {
    name: "create_routine_folder",
    description:
      "Create a new folder to organize routines. The folder will be inserted at index 0.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "The title of the folder",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "get_user_info",
    description:
      "Get the authenticated user's Hevy profile information including their display name and profile URL.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_workouts": {
        const { page = 1, pageSize = 5 } = (args ?? {}) as {
          page?: number;
          pageSize?: number;
        };
        const data = await hevyFetch(
          `/v1/workouts?page=${page}&pageSize=${pageSize}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_workout": {
        const { workoutId } = args as { workoutId: string };
        const data = await hevyFetch(`/v1/workouts/${workoutId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_workout_count": {
        const data = await hevyFetch("/v1/workouts/count");
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_routines": {
        const { page = 1, pageSize = 5 } = (args ?? {}) as {
          page?: number;
          pageSize?: number;
        };
        const data = await hevyFetch(
          `/v1/routines?page=${page}&pageSize=${pageSize}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_routine": {
        const { routineId } = args as { routineId: string };
        const data = await hevyFetch(`/v1/routines/${routineId}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
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
            exercises: exercises.map((ex, index) => ({
              exercise_template_id: ex.exercise_template_id,
              superset_id: null,
              rest_seconds: ex.rest_seconds ?? 90,
              notes: ex.notes ?? "",
              sets: ex.sets.map((set) => ({
                type: set.type,
                weight_kg: set.weight_kg ?? null,
                reps: set.reps ?? null,
                distance_meters: set.distance_meters ?? null,
                duration_seconds: set.duration_seconds ?? null,
                rep_range: set.rep_range ?? null,
              })),
            })),
          },
        };
        const data = await hevyFetch("/v1/routines", {
          method: "POST",
          body: JSON.stringify(body),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
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
              sets: ex.sets.map((set) => ({
                type: set.type,
                weight_kg: set.weight_kg ?? null,
                reps: set.reps ?? null,
                distance_meters: set.distance_meters ?? null,
                duration_seconds: set.duration_seconds ?? null,
                rep_range: set.rep_range ?? null,
              })),
            })),
          },
        };
        const data = await hevyFetch(`/v1/routines/${routineId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_exercise_templates": {
        const { page = 1, pageSize = 20 } = (args ?? {}) as {
          page?: number;
          pageSize?: number;
        };
        const data = await hevyFetch(
          `/v1/exercise_templates?page=${page}&pageSize=${pageSize}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_exercise_template": {
        const { exerciseTemplateId } = args as { exerciseTemplateId: string };
        const data = await hevyFetch(
          `/v1/exercise_templates/${exerciseTemplateId}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

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
        const data = await hevyFetch(
          `/v1/exercise_history/${exerciseTemplateId}${query}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_routine_folders": {
        const { page = 1, pageSize = 5 } = (args ?? {}) as {
          page?: number;
          pageSize?: number;
        };
        const data = await hevyFetch(
          `/v1/routine_folders?page=${page}&pageSize=${pageSize}`
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "create_routine_folder": {
        const { title } = args as { title: string };
        const data = await hevyFetch("/v1/routine_folders", {
          method: "POST",
          body: JSON.stringify({ routine_folder: { title } }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "get_user_info": {
        const data = await hevyFetch("/v1/user/info");
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Hevy MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
