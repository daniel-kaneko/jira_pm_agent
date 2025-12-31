"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useCSV } from "@/contexts/CSVContext";
import { CSVUploadProps } from "./types";

const VALID_EXTENSIONS = [".csv", ".tsv", ".txt"];
const VALID_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "text/tab-separated-values",
  "application/csv",
  "application/vnd.ms-excel",
];

interface ValidationError {
  message: string;
  details?: string;
}

function validateCSVFile(file: File): ValidationError | null {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!VALID_EXTENSIONS.includes(extension)) {
    return {
      message: "Invalid file type",
      details: `Expected .csv file, got ${extension || "no extension"}`,
    };
  }

  if (file.type && !VALID_MIME_TYPES.includes(file.type)) {
    console.warn(`Unexpected MIME type: ${file.type}, proceeding anyway`);
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      message: "File too large",
      details: "Maximum file size is 10MB",
    };
  }

  if (file.size === 0) {
    return {
      message: "Empty file",
      details: "The selected file is empty",
    };
  }

  return null;
}

export function CSVUpload({ onUploadComplete, disabled }: CSVUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loadCSV, csvSummary, isLoading, clearCSV, getCSVForAI } = useCSV();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<ValidationError | null>(null);

  const handleClick = () => {
    setError(null);
    if (csvSummary) {
      setShowConfirm(true);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleConfirmReplace = useCallback(() => {
    setShowConfirm(false);
    clearCSV();
    fileInputRef.current?.click();
  }, [clearCSV]);

  const handleCancelReplace = useCallback(() => {
    setShowConfirm(false);
  }, []);

  const handleDismissError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    if (!showConfirm && !error) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (error) {
          handleDismissError();
        } else {
          handleCancelReplace();
        }
      } else if (e.key === "Enter" && showConfirm) {
        handleConfirmReplace();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showConfirm, error, handleCancelReplace, handleConfirmReplace, handleDismissError]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateCSVFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = "";
      return;
    }

    try {
      const result = await loadCSV(file);
      onUploadComplete?.(result.aiMessage, result.rows);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError({
        message: "Failed to parse CSV",
        details: errorMessage,
      });
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

      {showConfirm && (
        <div className="confirm-overlay" onClick={handleCancelReplace}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-header">
              <span className="confirm-icon">⚠</span>
              <span>Replace CSV?</span>
            </div>
            <p className="confirm-message">
              Current file: <strong>{csvSummary?.fileName}</strong>
              <br />
              <span className="confirm-detail">
                {csvSummary?.rowCount} rows will be replaced
              </span>
            </p>
            <div className="confirm-actions">
              <button
                className="confirm-btn confirm-btn-cancel"
                onClick={handleCancelReplace}
              >
                Cancel <span className="confirm-key">Esc</span>
              </button>
              <button
                className="confirm-btn confirm-btn-replace"
                onClick={handleConfirmReplace}
              >
                Replace <span className="confirm-key">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="confirm-overlay" onClick={handleDismissError}>
          <div className="confirm-modal error-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-header error-header">
              <span className="confirm-icon">✕</span>
              <span>{error.message}</span>
            </div>
            {error.details && (
              <p className="confirm-message">
                <span className="confirm-detail">{error.details}</span>
              </p>
            )}
            <div className="confirm-actions">
              <button
                className="confirm-btn confirm-btn-cancel"
                onClick={handleDismissError}
              >
                Dismiss <span className="confirm-key">Esc</span>
              </button>
            </div>
          </div>
        </div>
      )}

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

        .confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(2px);
          animation: fadeIn 0.15s ease-out;
        }

        .confirm-modal {
          background: var(--bg-soft, #1a1a1a);
          border: 1px solid var(--bg-highlight, #333);
          border-radius: 8px;
          padding: 20px;
          min-width: 320px;
          max-width: 400px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          animation: slideIn 0.15s ease-out;
        }

        .confirm-header {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          color: var(--yellow, #facc15);
          margin-bottom: 12px;
        }

        .confirm-icon {
          font-size: 18px;
        }

        .confirm-message {
          color: var(--fg, #e5e5e5);
          font-size: 14px;
          line-height: 1.5;
          margin: 0 0 20px 0;
        }

        .confirm-detail {
          color: var(--fg-muted, #888);
          font-size: 13px;
        }

        .confirm-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .confirm-btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s;
          border: 1px solid transparent;
        }

        .confirm-btn-cancel {
          background: transparent;
          border-color: var(--bg-highlight, #444);
          color: var(--fg-muted, #888);
        }

        .confirm-btn-cancel:hover {
          background: var(--bg-highlight, #333);
          color: var(--fg, #e5e5e5);
        }

        .confirm-btn-replace {
          background: var(--yellow, #facc15);
          color: #000;
          border-color: var(--yellow, #facc15);
        }

        .confirm-btn-replace:hover {
          background: #fbbf24;
          border-color: #fbbf24;
        }

        .error-modal {
          border-color: var(--red, #ef4444);
        }

        .error-header {
          color: var(--red, #ef4444);
        }

        .confirm-key {
          font-size: 10px;
          padding: 2px 5px;
          border-radius: 3px;
          background: rgba(0, 0, 0, 0.2);
          font-family: var(--font-mono, monospace);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
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

