import { TOOL_NAMES, type ToolName } from "./tools";

export const MAX_UNIQUE_VALUES_FOR_FILTER = 20;
export const MAX_VALUES_TO_SHOW = 10;

/** Tools that require user confirmation before execution */
export const WRITE_TOOLS: ToolName[] = [
  TOOL_NAMES.CREATE_ISSUES,
  TOOL_NAMES.UPDATE_ISSUES,
];

export const RETRY_DELAY_MS = 1000;
export const MAX_RETRIES = 3;

export const PREVIEW_COUNT = 5;

