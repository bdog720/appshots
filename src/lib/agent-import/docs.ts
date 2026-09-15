import { EXAMPLE_MANIFEST } from "./example";
import { buildAgentPrompt } from "./prompt";
import { buildJsonSchema } from "./schema";

/** Repo-relative paths of the committed, generated agent-import docs. */
export const AGENT_DOC_PATHS = {
  prompt: "docs/agent-import/PROMPT.md",
  schema: "docs/agent-import/appshots-import.schema.json",
  example: "docs/agent-import/example/appshots.json",
} as const;

export const renderAgentDocs = (): Record<string, string> => ({
  [AGENT_DOC_PATHS.prompt]: buildAgentPrompt(),
  [AGENT_DOC_PATHS.schema]: `${JSON.stringify(buildJsonSchema(), null, 2)}\n`,
  [AGENT_DOC_PATHS.example]: `${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}\n`,
});
