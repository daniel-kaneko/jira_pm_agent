import type { JiraProjectConfig } from "./types";

/**
 * Get all configured Jira projects from JIRA_CONFIGS environment variable.
 * @returns Array of project configurations.
 * @throws Error if JIRA_CONFIGS is not set or invalid.
 */
export function getConfigs(): JiraProjectConfig[] {
  const configsJson = process.env.JIRA_CONFIGS;

  if (!configsJson) {
    throw new Error(
      "JIRA_CONFIGS environment variable is required. Example: " +
        '[{"id":"project1","name":"Project 1","baseUrl":"https://company.atlassian.net","boardId":"123","projectKey":"PROJ","email":"user@example.com","apiToken":"YOUR_API_TOKEN"}]'
    );
  }

  try {
    const configs = JSON.parse(configsJson) as JiraProjectConfig[];

    if (!Array.isArray(configs) || configs.length === 0) {
      throw new Error("JIRA_CONFIGS must be a non-empty array");
    }

    for (const config of configs) {
      if (
        !config.id ||
        !config.name ||
        !config.baseUrl ||
        !config.boardId ||
        !config.projectKey ||
        !config.email ||
        !config.apiToken
      ) {
        throw new Error(
          `Invalid config: each project must have id, name, baseUrl, boardId, projectKey, email, and apiToken. Got: ${JSON.stringify(
            config
          )}`
        );
      }
    }

    return configs;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`JIRA_CONFIGS is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get a specific project configuration by ID.
 * @param id - The project ID to find.
 * @returns The project configuration.
 * @throws Error if project is not found.
 */
export function getConfig(id: string): JiraProjectConfig {
  const configs = getConfigs();
  const config = configs.find((c) => c.id === id);

  if (!config) {
    const availableIds = configs.map((c) => c.id).join(", ");
    throw new Error(`Config "${id}" not found. Available: ${availableIds}`);
  }

  return config;
}

/**
 * Get the default (first) project configuration.
 * @returns The first project configuration.
 */
export function getDefaultConfig(): JiraProjectConfig {
  const configs = getConfigs();
  return configs[0];
}

/**
 * Get board ID as number from a config.
 * @param config - The project configuration.
 * @returns The board ID as a number.
 */
export function getBoardId(config: JiraProjectConfig): number {
  return parseInt(config.boardId, 10);
}
