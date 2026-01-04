/**
 * Session management for multi-config support
 */

import type { Message } from "@/app/components/chat";
import type { CSVRow } from "@/lib/types";
import type { ConfigSession } from "./types";

/** In-memory session store per config */
const configSessions = new Map<string, ConfigSession>();

/**
 * Save current session state to the store
 */
export function saveSession(
  configId: string,
  messages: Message[],
  csvData: CSVRow[] | null
): void {
  configSessions.set(configId, {
    messages: [...messages],
    csvData,
  });
}

/**
 * Load session state from the store
 */
export function loadSession(configId: string): ConfigSession | undefined {
  return configSessions.get(configId);
}

/**
 * Delete a session from the store
 */
export function deleteSession(configId: string): void {
  configSessions.delete(configId);
}

/**
 * Check if a session exists
 */
export function hasSession(configId: string): boolean {
  return configSessions.has(configId);
}

