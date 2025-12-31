"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import Papa from "papaparse";

export interface CSVRow {
  [key: string]: string;
}

export interface CSVSummary {
  fileName: string;
  rowCount: number;
  columns: string[];
  sampleRows: CSVRow[];
  columnStats: Record<string, { uniqueValues: string[]; count: number }>;
}

interface CSVContextType {
  csvData: CSVRow[] | null;
  csvSummary: CSVSummary | null;
  isLoading: boolean;
  error: string | null;
  loadCSV: (file: File) => Promise<CSVSummary>;
  clearCSV: () => void;
  queryCSV: (filters: Record<string, string>, limit?: number) => CSVRow[];
  getCSVForAI: () => string;
}

const CSVContext = createContext<CSVContextType | null>(null);

export function CSVProvider({ children }: { children: React.ReactNode }) {
  const [csvData, setCsvData] = useState<CSVRow[] | null>(null);
  const [csvSummary, setCsvSummary] = useState<CSVSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCSV = useCallback(async (file: File): Promise<CSVSummary> => {
    setIsLoading(true);
    setError(null);

    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as CSVRow[];
          const columns = results.meta.fields || [];

          const columnStats: Record<string, { uniqueValues: string[]; count: number }> = {};
          columns.forEach((col) => {
            const values = new Set<string>();
            rows.forEach((row) => {
              if (row[col]) values.add(row[col]);
            });
            columnStats[col] = {
              uniqueValues: Array.from(values).slice(0, 20),
              count: values.size,
            };
          });

          const summary: CSVSummary = {
            fileName: file.name,
            rowCount: rows.length,
            columns,
            sampleRows: rows.slice(0, 5),
            columnStats,
          };

          setCsvData(rows);
          setCsvSummary(summary);
          setIsLoading(false);
          resolve(summary);
        },
        error: (err) => {
          setError(err.message);
          setIsLoading(false);
          reject(err);
        },
      });
    });
  }, []);

  const clearCSV = useCallback(() => {
    setCsvData(null);
    setCsvSummary(null);
    setError(null);
  }, []);

  const queryCSV = useCallback(
    (filters: Record<string, string>, limit = 50): CSVRow[] => {
      if (!csvData) return [];

      let filtered = csvData;
      Object.entries(filters).forEach(([column, value]) => {
        if (!value) return;
        filtered = filtered.filter((row) =>
          row[column]?.toLowerCase().includes(value.toLowerCase())
        );
      });

      return filtered.slice(0, limit);
    },
    [csvData]
  );

  const getCSVForAI = useCallback((): string => {
    if (!csvSummary) return "";

    const filterableColumns = Object.entries(csvSummary.columnStats)
      .filter(([, stats]) => stats.count <= 20)
      .map(([col, stats]) => `  - ${col}: ${stats.uniqueValues.join(", ")}`)
      .join("\n");

    return `CSV Uploaded: "${csvSummary.fileName}"
- Total rows: ${csvSummary.rowCount}
- Columns: ${csvSummary.columns.join(", ")}

Filterable columns (with unique values):
${filterableColumns}

Sample data (first 3 rows):
${csvSummary.sampleRows
  .slice(0, 3)
  .map((row) => JSON.stringify(row))
  .join("\n")}

You can use query_csv to filter this data, then create_issues to bulk create Jira issues.`;
  }, [csvSummary]);

  return (
    <CSVContext.Provider
      value={{
        csvData,
        csvSummary,
        isLoading,
        error,
        loadCSV,
        clearCSV,
        queryCSV,
        getCSVForAI,
      }}
    >
      {children}
    </CSVContext.Provider>
  );
}

export function useCSV() {
  const context = useContext(CSVContext);
  if (!context) {
    throw new Error("useCSV must be used within a CSVProvider");
  }
  return context;
}

