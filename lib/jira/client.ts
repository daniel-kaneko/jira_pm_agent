/**
 * Re-export Jira client from modular implementation
 * @module jira/client
 */

export {
  createJiraClient,
  type JiraClient,
  extractTextFromAdf,
  buildDescriptionField,
} from "./client/index";
