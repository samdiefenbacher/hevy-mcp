<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/hevy-logo.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/hevy-logo-dark.svg" />
    <img src="assets/hevy-logo-dark.svg" alt="Hevy Logo" width="220" />
  </picture>
  <h1>hevy-mcp</h1>
  <p><strong>A Model Context Protocol server for the Hevy workout tracking app.</strong></p>
  <p>Let AI analyze your training, give feedback on your routines, and build personalized workout plans — all connected directly to your Hevy account.</p>

  <img src="https://img.shields.io/badge/MCP-compatible-blue?style=flat-square" alt="MCP compatible" />
  <img src="https://img.shields.io/badge/Hevy-Pro_required-orange?style=flat-square" alt="Hevy Pro required" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />

  <br /><br />
  <sub>⚠️ This is an independent, community-built project and is not affiliated with or endorsed by Hevy.</sub>
</div>

---

## What You Can Do

Once connected, you can ask Claude (or any MCP-compatible AI) things like:

- *"Review my current routines and tell me if there are any muscle group imbalances."*
- *"Build me a 4-day upper/lower split and save it to Hevy."*
- *"How has my bench press progressed over the last 3 months?"*
- *"I only have 45 minutes and dumbbells — create a full body routine."*
- *"Update my Push Day to add more tricep volume."*

---

## Tools

| Tool | Description |
|------|-------------|
| `get_workouts` | Fetch paginated workout history |
| `get_workout` | Get full details of a single workout |
| `get_workout_count` | Total number of logged workouts |
| `get_routines` | List all saved routines |
| `get_routine` | Get a single routine with all exercises and sets |
| `create_routine` | Create a new workout routine in Hevy |
| `update_routine` | Modify an existing routine |
| `get_exercise_templates` | Browse available exercises and their IDs |
| `get_exercise_template` | Get details on a single exercise |
| `get_exercise_history` | Track progress for a specific movement over time |
| `get_routine_folders` | List routine folders |
| `create_routine_folder` | Create a new folder to organize routines |
| `get_user_info` | Get your Hevy profile info |

---

## Setup Guide

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A **Hevy Pro** subscription
- [Claude Desktop](https://claude.ai/download) (or any MCP-compatible client)

### Step 1 — Get Your Hevy API Key

1. Open [hevy.com/settings?developer](https://hevy.com/settings?developer) in your browser
2. Sign in with your Hevy Pro account
3. Copy your API key

> **Note:** The Hevy API is only available to Hevy Pro subscribers.

### Step 2 — Clone and Build

```bash
git clone https://github.com/samdiefenbacher/hevy-mcp.git
cd hevy-mcp
npm install
npm run build
```

### Step 3 — Configure Claude Desktop

Open your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the following under `mcpServers`:

```json
{
  "mcpServers": {
    "hevy": {
      "command": "node",
      "args": ["/absolute/path/to/hevy-mcp/build/index.js"],
      "env": {
        "HEVY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

> Replace `/absolute/path/to/hevy-mcp` with the actual path where you cloned the repo.
>
> **Windows example:** `C:\\Users\\YourName\\Documents\\GitHub\\hevy-mcp\\build\\index.js`

### Step 4 — Restart Claude Desktop

Fully quit and reopen Claude Desktop. You should see the Hevy tools available in a new conversation.

---

## Development

```bash
# Watch mode — recompiles on save
npm run dev

# One-time build
npm run build

# Run the server directly (for testing)
HEVY_API_KEY=your-key node build/index.js
```

---

## Authentication

All requests to the Hevy API require your API key passed via the `HEVY_API_KEY` environment variable. The key is sent as the `api-key` header on every request.

Get your key at [hevy.com/settings?developer](https://hevy.com/settings?developer).

---

## API Reference

This server wraps the [Hevy Public API](https://api.hevyapp.com/docs/) (v1). The API is currently in early access and subject to change.

---

<div align="center">
  <sub>Built with the <a href="https://modelcontextprotocol.io">Model Context Protocol</a> · Not affiliated with Hevy</sub>
</div>
