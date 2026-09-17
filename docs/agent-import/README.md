# Agent import

Let an AI agent that knows your app's codebase produce a polished first version of your store screenshots.

1. In Breezel, open the Project menu → **Import from agent…** → **Copy agent prompt**.
2. Give the prompt to an agent working in your app's repository (Claude Code, etc.). It gathers your brand color, font and features, uses your captured screenshots, and writes `breezel.json` next to them.
3. Back in Breezel, drop that folder (or a zip of it) into the dialog. Review the summary and warnings, then **Create new project** or **Replace current project**.
4. Tweak anything in the editor and export.

Files here:

- `PROMPT.md` — the brief the agent receives (generated).
- `breezel-import.schema.json` — JSON Schema for `breezel.json` (generated).
- `example/` — a complete sample bundle with placeholder images (generated).

Regenerate after changing devices, fonts, styles, layouts, export sizes or the schema: `bun run gen:agent-docs`.
