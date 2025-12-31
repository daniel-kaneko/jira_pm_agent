import type { CSVRow } from "@/lib/types";

/**
 * Props for the CSVUpload component
 */
export interface CSVUploadProps {
  /** Callback when CSV upload is complete with AI-formatted summary and parsed rows */
  onUploadComplete?: (summary: string, rows: CSVRow[]) => void;
  /** Whether the upload button is disabled */
  disabled?: boolean;
}

