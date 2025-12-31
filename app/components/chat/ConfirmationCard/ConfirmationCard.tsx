"use client";

import React from "react";
import type { PendingAction } from "@/lib/types/api";

export type { PendingAction };

interface ConfirmationCardProps {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationCard({
  action,
  onConfirm,
  onCancel,
}: ConfirmationCardProps) {
  const isCreate = action.toolName === "create_issues";

  const issueCount = action.issues.length;
  const isLargeBatch = issueCount > 10;

  return (
    <div className="confirmation-card">
      {isLargeBatch && (
        <div className="batch-header">
          <span className="batch-count">{issueCount} issues</span>
          <span className="batch-hint">Scroll to review</span>
        </div>
      )}
      <div className={`table-container ${isLargeBatch ? "scrollable" : ""}`}>
        <table className="issues-table">
          <thead>
            <tr>
              <th className="col-summary">Summary</th>
              <th className="col-assignee">Assignee</th>
              <th className="col-points">Pts</th>
              {!isCreate && <th className="col-status">Status</th>}
            </tr>
          </thead>
          <tbody>
            {action.issues.map((issue, index) => (
              <tr key={index}>
                <td className="col-summary">
                  {issue.issue_key && (
                    <span className="issue-key">{issue.issue_key}</span>
                  )}
                  <div className="summary-text">{issue.summary || "—"}</div>
                  {issue.description && (
                    <div className="description-text">{issue.description}</div>
                  )}
                </td>
                <td className="col-assignee">{issue.assignee || "—"}</td>
                <td className="col-points">{issue.story_points ?? "—"}</td>
                {!isCreate && (
                  <td className="col-status">{issue.status || "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-footer">
        <span className="footer-hint">
          {isCreate ? "Create" : "Update"} {action.issues.length} issue
          {action.issues.length !== 1 ? "s" : ""}?
        </span>
        <div className="card-actions">
          <button className="btn btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-confirm" onClick={onConfirm}>
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
          overflow: visible;
        }

        .table-container.scrollable {
          max-height: 300px;
          overflow-y: auto;
        }

        .issues-table {
          width: 100%;
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

        .col-summary {
          width: 50%;
        }

        .summary-text {
          font-weight: 500;
        }

        .description-text {
          font-size: 11px;
          color: var(--fg-muted, #888);
          margin-top: 4px;
          line-height: 1.4;
        }

        .col-assignee {
          width: 25%;
          color: var(--fg-muted, #aaa);
        }

        .col-points {
          width: 8%;
          text-align: center;
          color: var(--accent, #3b82f6);
          font-weight: 600;
          font-size: 12px;
        }

        .col-status {
          width: 17%;
        }

        .issue-key {
          display: inline-block;
          background: var(--accent, #3b82f6);
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
