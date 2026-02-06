"use client";

import React, { useMemo } from "react";
import type { PendingAction } from "@/lib/types/api";
import { useChatContext } from "@/app/contexts";

export type { PendingAction };

interface ConfirmationCardProps {
  action: PendingAction;
}

type IssueField = keyof PendingAction["issues"][0];

interface Column {
  key: IssueField;
  label: string;
  hasData: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  issue_key: "Key",
  summary: "Summary",
  description: "Description",
  assignee: "Assignee",
  status: "Status",
  story_points: "Pts",
  issue_type: "Type",
  priority: "Priority",
  labels: "Labels",
  fix_versions: "Fix Versions",
  components: "Components",
  due_date: "Due Date",
  parent_key: "Parent",
  sprint_id: "Sprint",
};

const PRIORITY_FIELDS: IssueField[] = [
  "issue_key",
  "summary",
  "assignee",
  "status",
  "story_points",
];

const EXCLUDED_FIELDS: Set<IssueField> = new Set([]);

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return String(value);
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

export function ConfirmationCard({ action }: ConfirmationCardProps) {
  const { confirmAction, cancelAction } = useChatContext();
  const isCreate = action.toolName === "create_issues";
  const issueCount = action.issues.length;
  const isLargeBatch = issueCount > 10;

  const columns = useMemo(() => {
    const fieldMap = new Map<IssueField, boolean>();

    action.issues.forEach((issue) => {
      Object.keys(issue).forEach((key) => {
        const fieldKey = key as IssueField;
        if (!EXCLUDED_FIELDS.has(fieldKey)) {
          const hasData = hasValue(issue[fieldKey]);
          if (hasData) {
            fieldMap.set(fieldKey, true);
          }
        }
      });
    });

    const columns: Column[] = [];
    const addedFields = new Set<IssueField>();

    PRIORITY_FIELDS.forEach((field) => {
      if (fieldMap.has(field) && !addedFields.has(field)) {
        columns.push({
          key: field,
          label: FIELD_LABELS[field] || field,
          hasData: true,
        });
        addedFields.add(field);
      }
    });

    fieldMap.forEach((hasData, field) => {
      if (!addedFields.has(field)) {
        columns.push({
          key: field,
          label: FIELD_LABELS[field] || field,
          hasData,
        });
        addedFields.add(field);
      }
    });

    return columns;
  }, [action.issues]);

  return (
    <div className="confirmation-card">
      {isLargeBatch && (
        <div className="batch-header">
          <span className="batch-count">{issueCount} issues</span>
          <span className="batch-hint">Scroll to review</span>
        </div>
      )}
      <div className={`table-container ${isLargeBatch ? "scrollable" : ""}`}>
        <div className="table-wrapper">
          <table className="issues-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={`col-${col.key}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {action.issues.map((issue, index) => (
                <tr key={index}>
                  {columns.map((col) => {
                    const value = issue[col.key];
                    const formatted = formatFieldValue(value);
                    const isEmpty = !hasValue(value);

                    return (
                      <td
                        key={col.key}
                        className={`col-${col.key} ${isEmpty ? "empty" : ""}`}
                      >
                        {col.key === "issue_key" && value ? (
                          <span className="issue-key">{formatted}</span>
                        ) : col.key === "summary" ? (
                          <div>
                            {formatted !== "—" && (
                              <div className="summary-text">{formatted}</div>
                            )}
                            {issue.description && (
                              <div className="description-text">
                                {issue.description}
                              </div>
                            )}
                            {issue.parent_key && (
                              <div className="parent-key-text">
                                Parent:{" "}
                                <span className="parent-key-value">
                                  {issue.parent_key}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : col.key === "story_points" ? (
                          <span className="points-value">{formatted}</span>
                        ) : col.key === "parent_key" ? (
                          <span className="parent-key-value">{formatted}</span>
                        ) : (
                          formatted
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-footer">
        <span className="footer-hint">
          {isCreate ? "Create" : "Update"} {action.issues.length} issue
          {action.issues.length !== 1 ? "s" : ""}?
        </span>
        <div className="card-actions">
          <button className="btn btn-cancel" onClick={cancelAction}>
            Cancel
          </button>
          <button className="btn btn-confirm" onClick={confirmAction}>
            Confirm
          </button>
        </div>
      </div>

      <style jsx>{`
        .confirmation-card {
          background: var(--bg-soft, #1a1a1a);
          border: 1px solid var(--bg-highlight, #333);
          border-radius: 8px;
          margin: 12px 0;
          overflow: hidden;
          animation: slideIn 0.2s ease-out;
        }

        .batch-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--bg-highlight, #252525);
          border-bottom: 1px solid var(--bg-highlight, #333);
        }

        .batch-count {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent, #3b82f6);
        }

        .batch-hint {
          font-size: 11px;
          color: var(--fg-muted, #666);
        }

        .table-container {
          overflow-x: auto;
          overflow-y: visible;
          -webkit-overflow-scrolling: touch;
        }

        .table-container.scrollable {
          max-height: 300px;
          overflow-y: auto;
        }

        .table-wrapper {
          min-width: 100%;
          display: inline-block;
        }

        .issues-table {
          width: 100%;
          min-width: 600px;
          border-collapse: collapse;
          font-size: 13px;
        }

        .issues-table th {
          text-align: left;
          padding: 10px 12px;
          background: var(--bg-highlight, #252525);
          color: var(--fg-muted, #888);
          font-weight: 500;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--bg-highlight, #333);
        }

        .issues-table td {
          padding: 10px 12px;
          color: var(--fg, #e5e5e5);
          border-bottom: 1px solid var(--bg-highlight, #252525);
          vertical-align: top;
        }

        .issues-table tr:last-child td {
          border-bottom: none;
        }

        .issues-table th {
          white-space: nowrap;
          min-width: 80px;
        }

        .issues-table td {
          white-space: nowrap;
          min-width: 80px;
        }

        .issues-table td.empty {
          color: var(--fg-muted, #666);
        }

        .col-issue_key {
          min-width: 100px;
        }

        .col-summary {
          min-width: 200px;
          white-space: normal !important;
        }

        .summary-text {
          font-weight: 500;
          white-space: normal;
        }

        .description-text {
          font-size: 11px;
          color: var(--fg-muted, #888);
          margin-top: 4px;
          line-height: 1.4;
          white-space: normal;
        }

        .parent-key-text {
          font-size: 11px;
          color: var(--fg-muted, #888);
          margin-top: 6px;
          white-space: normal;
        }

        .parent-key-value {
          color: var(--accent, #3b82f6);
          font-weight: 500;
          font-family: var(--font-mono, monospace);
        }

        .col-assignee {
          min-width: 120px;
        }

        .col-story_points,
        .col-points {
          text-align: center;
          min-width: 60px;
        }

        .points-value {
          color: var(--accent, #3b82f6);
          font-weight: 600;
          font-size: 12px;
        }

        .col-status {
          min-width: 100px;
        }

        .col-parent_key {
          min-width: 120px;
        }

        .col-issue_type,
        .col-priority {
          min-width: 100px;
        }

        .col-labels,
        .col-fix_versions,
        .col-components {
          min-width: 150px;
          white-space: normal !important;
        }

        .col-due_date {
          min-width: 100px;
        }

        .col-description {
          min-width: 200px;
          white-space: normal !important;
        }

        .col-sprint_id {
          min-width: 80px;
          text-align: center;
        }

        .issue-key {
          display: inline-block;
          background: var(--blue, #2563eb);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 600;
          font-family: var(--font-mono, monospace);
          margin-right: 8px;
          vertical-align: middle;
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          background: var(--bg-highlight, #1f1f1f);
          border-top: 1px solid var(--bg-highlight, #333);
        }

        .footer-hint {
          font-size: 12px;
          color: var(--fg-muted, #888);
        }

        .card-actions {
          display: flex;
          gap: 8px;
        }

        .btn {
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.15s;
        }

        .btn-cancel {
          background: transparent;
          border-color: var(--bg-highlight, #444);
          color: var(--fg-muted, #888);
        }

        .btn-cancel:hover {
          background: var(--bg-highlight, #333);
          color: var(--fg, #e5e5e5);
        }

        .btn-confirm {
          background: var(--green, #10b981);
          color: white;
        }

        .btn-confirm:hover {
          background: #059669;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
