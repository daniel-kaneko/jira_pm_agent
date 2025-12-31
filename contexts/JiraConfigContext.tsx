"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface ProjectConfig {
  id: string;
  name: string;
  projectKey: string;
}

interface JiraConfigContextType {
  configs: ProjectConfig[];
  selectedConfig: ProjectConfig | null;
  isLoading: boolean;
  error: string | null;
  selectConfig: (id: string) => void;
}

const JiraConfigContext = createContext<JiraConfigContextType | null>(null);

const STORAGE_KEY = "jira-selected-config";

export function JiraConfigProvider({ children }: { children: ReactNode }) {
  const [configs, setConfigs] = useState<ProjectConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<ProjectConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfigs() {
      try {
        const response = await fetch("/api/jira/configs");
        const data = await response.json();

        if (data.error) {
          setError(data.error);
          setConfigs([]);
          return;
        }

        setConfigs(data.configs || []);

        const savedConfigId = localStorage.getItem(STORAGE_KEY);
        const configToSelect = savedConfigId
          ? data.configs.find((c: ProjectConfig) => c.id === savedConfigId)
          : data.configs[0];

        if (configToSelect) {
          setSelectedConfig(configToSelect);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch configs");
      } finally {
        setIsLoading(false);
      }
    }

    fetchConfigs();
  }, []);

  const selectConfig = useCallback(
    (id: string) => {
      const config = configs.find((c) => c.id === id);
      if (config) {
        setSelectedConfig(config);
        localStorage.setItem(STORAGE_KEY, id);
      }
    },
    [configs]
  );

  return (
    <JiraConfigContext.Provider
      value={{
        configs,
        selectedConfig,
        isLoading,
        error,
        selectConfig,
      }}
    >
      {children}
    </JiraConfigContext.Provider>
  );
}

export function useJiraConfig(): JiraConfigContextType {
  const context = useContext(JiraConfigContext);
  if (!context) {
    throw new Error("useJiraConfig must be used within a JiraConfigProvider");
  }
  return context;
}

