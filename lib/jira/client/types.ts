/**
 * Internal types for the Jira client
 */

import type { JiraProjectConfig } from "../types";

/**
 * Context passed to all client methods
 */
export interface ClientContext {
  baseUrl: string;
  email: string;
  apiToken: string;
}

/**
 * Create context from config
 */
export function createContext(config: JiraProjectConfig): ClientContext {
  return {
    baseUrl: config.baseUrl,
    email: config.email,
    apiToken: config.apiToken,
  };
}

