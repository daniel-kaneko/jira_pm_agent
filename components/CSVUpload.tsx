"use client";

import React, { useRef } from "react";
import { useCSV } from "@/contexts/CSVContext";

interface CSVUploadProps {
  onUploadComplete?: (summary: string) => void;
  disabled?: boolean;
}

export function CSVUpload({ onUploadComplete, disabled }: CSVUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loadCSV, csvSummary, isLoading, clearCSV, getCSVForAI } = useCSV();

  const handleClick = () => {
    if (csvSummary && !confirm("Replace current CSV?")) return;
    if (csvSummary) clearCSV();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await loadCSV(file);
      onUploadComplete?.(getCSVForAI());
    } catch (err) {
      console.error("Failed to parse CSV:", err);
    }

    e.target.value = "";
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <button
        onClick={handleClick}
        disabled={disabled || isLoading}
        className="csv-upload-button"
        title={csvSummary ? `CSV loaded: ${csvSummary.fileName}` : "Upload CSV"}
        type="button"
      >
        {isLoading ? (
          <LoadingIcon />
        ) : csvSummary ? (
          <CheckIcon />
        ) : (
          <PaperclipIcon />
        )}
      </button>
      <style jsx>{`
        .csv-upload-button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${csvSummary ? "var(--green, #10b981)" : "var(--fg-muted, #6b7280)"};
          transition: all 0.2s;
        }
        .csv-upload-button:hover:not(:disabled) {
          background: var(--bg-highlight, rgba(255, 255, 255, 0.1));
          color: ${csvSummary ? "var(--green, #34d399)" : "var(--fg-dim, #9ca3af)"};
        }
        .csv-upload-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 12l2 2 4-4" />
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function LoadingIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="animate-spin"
    >
      <path d="M12 2v4m0 12v4m-8-10h4m12 0h4m-5.66-5.66l-2.83 2.83m-5.66 5.66l-2.83 2.83m11.32 0l-2.83-2.83m-5.66-5.66L5.34 5.34" />
    </svg>
  );
}

