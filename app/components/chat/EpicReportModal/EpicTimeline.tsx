"use client";

import { useMemo, useState } from "react";
import type { EpicReportResponse, FixVersionTabId } from "./types";
import type { JiraSprint } from "@/lib/jira/types";
import { issueBelongsToFixVersion } from "./utils";
import { getFilteredSprints, extractSprintNamesFromEpics } from "./sprintFilters";
import { useScrollSync } from "./useScrollSync";

interface EpicTimelineProps {
  epics: EpicReportResponse["epics"];
  sprints: JiraSprint[];
  selectedFixVersionTab: FixVersionTabId;
}

interface EpicSprintData {
  epic: EpicReportResponse["epics"][0];
  sprintIds: Set<number>;
  sprints: JiraSprint[];
  progress: number;
  issues: Array<{
    key: string;
    summary: string;
    status: string;
    sprint: string | null;
    sprintId: number | null;
  }>;
}

/**
 * EpicTimeline component displays epics and their associated sprints in a sprint-based grid.
 * @version 0.4.0
 */
export function EpicTimeline({
  epics,
  sprints,
  selectedFixVersionTab,
}: EpicTimelineProps) {
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const { headerScrollRef, rowsScrollRef } = useScrollSync();

  const sprintMap = useMemo(() => {
    const map = new Map<number, JiraSprint>();
    const nameMap = new Map<string, JiraSprint>();
    for (const sprint of sprints) {
      map.set(sprint.id, sprint);
      const normalizedName = sprint.name.trim().toLowerCase();
      if (!nameMap.has(normalizedName)) {
        nameMap.set(normalizedName, sprint);
      }
    }
    return { byId: map, byName: nameMap };
  }, [sprints]);

  const sprintsFromIssues = useMemo(() => {
    return extractSprintNamesFromEpics(epics, (issue) =>
      issueBelongsToFixVersion(issue, selectedFixVersionTab)
    );
  }, [epics, selectedFixVersionTab]);

  const sortedSprints = useMemo(() => {
    return getFilteredSprints(sprints, sprintsFromIssues);
  }, [sprints, sprintsFromIssues]);

  const epicSprintData = useMemo((): EpicSprintData[] => {
    return epics.map((epic) => {
      const sprintIds = new Set<number>();
      const epicSprints: JiraSprint[] = [];
      const epicIssues: EpicSprintData["issues"] = [];

      for (const statusData of Object.values(epic.breakdown_by_status)) {
        for (const issue of statusData.issues) {
          if (!issueBelongsToFixVersion(issue, selectedFixVersionTab)) continue;

          let issueSprintId: number | null = null;
          if (issue.sprint) {
            const normalizedIssueSprint = issue.sprint.trim().toLowerCase();
            const sprint = sprintMap.byName.get(normalizedIssueSprint) ||
              Array.from(sprintMap.byId.values()).find(
                (s) => s.name.trim().toLowerCase() === normalizedIssueSprint
              );
            if (sprint) {
              issueSprintId = sprint.id;
              if (!sprintIds.has(sprint.id)) {
                sprintIds.add(sprint.id);
                epicSprints.push(sprint);
              }
            }
          }

          epicIssues.push({
            key: issue.key,
            summary: issue.summary,
            status: issue.status,
            sprint: issue.sprint,
            sprintId: issueSprintId,
          });
        }
      }

      return {
        epic,
        sprintIds,
        sprints: epicSprints.sort(
          (a, b) =>
            (a.start_date ? new Date(a.start_date).getTime() : a.id) -
            (b.start_date ? new Date(b.start_date).getTime() : b.id)
        ),
        progress: epic.progress.percent_by_points,
        issues: epicIssues,
      };
    });
  }, [epics, sprintMap, selectedFixVersionTab]);

  const toggleEpic = (epicKey: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(epicKey)) {
        next.delete(epicKey);
      } else {
        next.add(epicKey);
      }
      return next;
    });
  };

  const getProgressColor = (progress: number): string => {
    if (progress >= 100) return "var(--green)";
    if (progress >= 50) return "var(--yellow)";
    return "var(--fg-muted)";
  };

  const getSprintStateColor = (state: string): string => {
    if (state === "active") return "var(--blue)";
    if (state === "closed") return "var(--fg-muted)";
    return "var(--bg)";
  };

  if (sortedSprints.length === 0) {
    return (
      <div className="p-4 bg-[var(--bg-highlight)] rounded-lg border border-[var(--bg-highlight)]">
        <p className="text-sm text-[var(--fg-muted)]">
          No sprint data available for timeline
        </p>
      </div>
    );
  }

  const rowHeight = 48;

  return (
    <div className="bg-[var(--bg-highlight)] rounded-lg border border-[var(--bg-highlight)]">
      <div className="p-6">
        <div className="flex gap-6">
          <div className="flex-shrink-0 w-80">
            <div className="text-xs text-[var(--fg-muted)] mb-3 font-medium">
              Epics
            </div>
            <div className="h-12 mb-1"></div>
            <div className="space-y-1">
              {epicSprintData.map((data) => {
                const isExpanded = expandedEpics.has(data.epic.epic.key);
                return (
                  <div key={data.epic.epic.key}>
                    <div
                      className="flex items-center gap-3 h-12 cursor-pointer hover:bg-[var(--bg)]/50 transition-colors"
                      style={{ minHeight: `${rowHeight}px` }}
                      onClick={() => toggleEpic(data.epic.epic.key)}
                    >
                      <div className="flex-shrink-0 w-4 flex items-center justify-center">
                        <svg
                          className={`w-4 h-4 text-[var(--fg-muted)] transition-transform ${isExpanded ? "rotate-90" : ""
                            }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--fg)] truncate">
                          {data.epic.epic.key}
                        </div>
                        <div className="text-xs text-[var(--fg-muted)] truncate">
                          {data.epic.epic.summary}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs font-medium text-[var(--fg-muted)] pr-3 w-16 text-right">
                        {data.progress}%
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="space-y-1 pl-7">
                        {data.issues.map((issue) => (
                          <div
                            key={issue.key}
                            className="flex items-center gap-3 h-12"
                            style={{ minHeight: `${rowHeight}px` }}
                          >
                            <div className="flex-shrink-0 text-[var(--fg-muted)] w-4 text-center">
                              →
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-[var(--fg)] truncate">
                                {issue.key}
                              </div>
                              <div className="text-xs text-[var(--fg-muted)] truncate">
                                {issue.summary}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-xs text-[var(--fg-muted)] pr-3 w-16 text-right">
                              {issue.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 relative min-w-0 flex flex-col">
            <div className="text-xs text-[var(--fg-muted)] mb-3 font-medium">
              Sprints
            </div>

            <div 
              ref={headerScrollRef} 
              className="sticky top-0 z-20 flex-shrink-0 overflow-x-auto pb-2 bg-[var(--bg-highlight)]"
            >
              <div className="flex gap-2" style={{ minWidth: `${sortedSprints.length * 140}px` }}>
                {sortedSprints.map((sprint) => (
                  <div
                    key={sprint.id}
                    className="flex-shrink-0 w-32 text-center"
                  >
                    <div
                      className="px-2 py-1 rounded text-xs font-medium mb-1"
                      style={{
                        backgroundColor: getSprintStateColor(sprint.state),
                        color: sprint.state === "active" ? "white" : "var(--fg)",
                      }}
                    >
                      {sprint.name}
                    </div>
                    {sprint.start_date && sprint.end_date && (
                      <div className="text-xs text-[var(--fg-muted)]">
                        {new Date(sprint.start_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {" - "}
                        {new Date(sprint.end_date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div ref={rowsScrollRef} className="flex-1 overflow-x-auto">
              <div style={{ minWidth: `${sortedSprints.length * 140}px` }}>
                <div className="flex gap-2 border-t border-[var(--bg)]">
                  {sortedSprints.map((sprint) => (
                    <div
                      key={`col-${sprint.id}`}
                      className="flex-shrink-0 w-32 border-l border-r border-[var(--bg)] opacity-20"
                    />
                  ))}
                </div>

                <div className="space-y-1">
                  {epicSprintData.map((data, epicIndex) => {
                    const isExpanded = expandedEpics.has(data.epic.epic.key);
                    const progressColor = getProgressColor(data.progress);
                    return (
                      <div key={data.epic.epic.key}>
                        <div
                          className="relative h-12 flex items-center"
                          style={{ minHeight: `${rowHeight}px` }}
                        >
                          <div className="absolute inset-0 border-b border-[var(--bg)] opacity-10" />

                          <div className="flex gap-2 w-full">
                            {sortedSprints.map((sprint) => {
                              const hasEpic = data.sprintIds.has(sprint.id);
                              return (
                                <div
                                  key={`${data.epic.epic.key}-${sprint.id}`}
                                  className="flex-shrink-0 w-32 h-full flex items-center"
                                >
                                  {hasEpic && (
                                    <div
                                      className="w-full h-8 rounded group cursor-pointer transition-all hover:opacity-100 flex items-center justify-center"
                                      style={{
                                        backgroundColor: progressColor,
                                        opacity: 0.8,
                                      }}
                                      title={`${data.epic.epic.key}: ${data.epic.epic.summary}\nSprint: ${sprint.name}\nProgress: ${data.progress}%`}
                                    >
                                      <span className="text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity truncate px-2">
                                        {data.epic.epic.key}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {isExpanded &&
                          data.issues.map((issue) => {
                            const issueSprintColor = issue.sprintId
                              ? getProgressColor(data.progress)
                              : "var(--fg-muted)";
                            return (
                              <div
                                key={issue.key}
                                className="relative h-12 flex items-center"
                                style={{ minHeight: `${rowHeight}px` }}
                              >
                                <div className="absolute inset-0 border-b border-[var(--bg)] opacity-10 bg-[var(--bg)]/20" />

                                <div className="flex gap-2 w-full">
                                  {sortedSprints.map((sprint) => {
                                    const hasIssue = issue.sprintId === sprint.id;
                                    return (
                                      <div
                                        key={`${issue.key}-${sprint.id}`}
                                        className="flex-shrink-0 w-32 h-full flex items-center"
                                      >
                                        {hasIssue && (
                                          <div
                                            className="w-full h-6 rounded group cursor-pointer transition-all hover:opacity-100 flex items-center justify-center"
                                            style={{
                                              backgroundColor: issueSprintColor,
                                              opacity: 0.6,
                                            }}
                                            title={`${issue.key}: ${issue.summary}\nSprint: ${sprint.name}\nStatus: ${issue.status}`}
                                          >
                                            <span className="text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity truncate px-2">
                                              {issue.key}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
