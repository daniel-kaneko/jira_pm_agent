import * as XLSX from "xlsx";
import type { EpicReportResponse } from "./types";
import { FIX_VERSION_TABS } from "./types";
import { getStatusCompletionPercentage, issueBelongsToFixVersion } from "./utils";
import { filterSprintName } from "./sprintFilters";

/**
 * Export epic report data to Excel with multiple sheets (one per fix version).
 */
export function exportEpicReportToExcel(reportData: EpicReportResponse): void {
  const workbook = XLSX.utils.book_new();

  let overallTotalIssues = 0;
  let overallCompletedIssues = 0;
  let overallTotalStoryPoints = 0;
  let overallCompletedStoryPoints = 0;
  let overallWeightedSum = 0;
  const overallStatusCounts: Record<string, number> = {};
  const overallStatusPoints: Record<string, number> = {};

  for (const epic of reportData.epics) {
    overallTotalIssues += epic.progress.total_issues;
    overallCompletedIssues += epic.progress.completed_issues;
    overallTotalStoryPoints += epic.progress.total_story_points;
    overallCompletedStoryPoints += epic.progress.completed_story_points;

    for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
      const statusWeight = getStatusCompletionPercentage(status);
      overallWeightedSum += statusData.count * statusWeight;
      overallStatusCounts[status] = (overallStatusCounts[status] || 0) + statusData.count;
      overallStatusPoints[status] = (overallStatusPoints[status] || 0) + statusData.story_points;
    }
  }

  const overallProgress = overallTotalIssues > 0
    ? Math.round((overallWeightedSum / overallTotalIssues) * 100)
    : 0;

  const globalSummaryRows: (string | number)[][] = [
    ["Global Summary"],
    [],
    ["Total Epics", reportData.total_epics],
    ["Total Issues", overallTotalIssues],
    ["Completed Issues", overallCompletedIssues],
    ["Total Story Points", overallTotalStoryPoints],
    ["Completed Story Points", Math.round(overallCompletedStoryPoints * 100) / 100],
    ["Overall Progress (%)", overallProgress],
    [],
    ["Issue Status Breakdown"],
    ["Status", "Count", "Story Points"],
  ];

  const sortedStatuses = Object.entries(overallStatusCounts).sort(
    (a, b) => b[1] - a[1]
  );

  for (const [status, count] of sortedStatuses) {
    globalSummaryRows.push([status, count, overallStatusPoints[status] || 0]);
  }

  const globalSummaryWorksheet = XLSX.utils.aoa_to_sheet(globalSummaryRows);
  XLSX.utils.book_append_sheet(workbook, globalSummaryWorksheet, "Global Summary");

  const epicSummaryRows: (string | number)[][] = [
    ["Epic Key",
      "Epic Summary",
      "Epic Status",
      "Epic Assignee",
      "Total Issues",
      "Completed Issues",
      "Progress (%)",
      "Total Story Points",
      "Completed Story Points",
      "Sprints"],
  ];

  for (const epic of reportData.epics) {
    let epicTotalIssues = 0;
    let epicCompletedIssues = 0;
    let epicTotalStoryPoints = 0;
    let epicCompletedStoryPoints = 0;
    let epicWeightedSum = 0;
    
    const epicSprints = new Set<string>();
    for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
      for (const issue of statusData.issues) {
        if (!issue.sprint) continue;
        if (!filterSprintName(issue.sprint.trim())) continue;
        epicSprints.add(issue.sprint.trim());
      }
    }
    
    const sortedSprints = Array.from(epicSprints).sort((a, b) => {
      const aMatch = a.match(/Sprint\s*(\d+)/i);
      const bMatch = b.match(/Sprint\s*(\d+)/i);
      if (aMatch && bMatch) {
        const aNum = parseInt(aMatch[1], 10);
        const bNum = parseInt(bMatch[1], 10);
        return aNum - bNum;
      }
      return a.localeCompare(b);
    });
    
    const sprintsString = sortedSprints.join(", ");

    for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
      const statusWeight = getStatusCompletionPercentage(status);
      epicTotalIssues += statusData.count;
      epicTotalStoryPoints += statusData.story_points;
      epicWeightedSum += statusData.count * statusWeight;

      if (statusWeight === 1.0) {
        epicCompletedIssues += statusData.count;
      }
    }

    epicCompletedStoryPoints = epic.progress.completed_story_points;
    const epicProgress = epicTotalIssues > 0
      ? Math.round((epicWeightedSum / epicTotalIssues) * 100)
      : 0;

    epicSummaryRows.push([
      epic.epic.key,
      epic.epic.summary,
      epic.epic.status,
      epic.epic.assignee || "",
      epicTotalIssues,
      epicCompletedIssues,
      epicProgress,
      epicTotalStoryPoints,
      Math.round(epicCompletedStoryPoints * 100) / 100,
      sprintsString,
    ]);
  }

  const epicSummaryWorksheet = XLSX.utils.aoa_to_sheet(epicSummaryRows);
  XLSX.utils.book_append_sheet(workbook, epicSummaryWorksheet, "Epic Summaries");

  const epicSprintDetailRows: (string | number)[][] = [
    ["Epic Key", "Epic Summary", "Sprint"],
  ];

  for (const epic of reportData.epics) {
    const epicSprints = new Set<string>();
    for (const [status, statusData] of Object.entries(epic.breakdown_by_status)) {
      for (const issue of statusData.issues) {
        if (issue.sprint && filterSprintName(issue.sprint.trim())) {
          epicSprints.add(issue.sprint.trim());
        }
      }
    }

    const sortedSprints = Array.from(epicSprints).sort((a, b) => {
      const aMatch = a.match(/Sprint\s*(\d+)/i);
      const bMatch = b.match(/Sprint\s*(\d+)/i);
      if (aMatch && bMatch) {
        const aNum = parseInt(aMatch[1], 10);
        const bNum = parseInt(bMatch[1], 10);
        return aNum - bNum;
      }
      return a.localeCompare(b);
    });

    for (const sprint of sortedSprints) {
      epicSprintDetailRows.push([
        epic.epic.key,
        epic.epic.summary,
        sprint,
      ]);
    }

    if (sortedSprints.length === 0) {
      epicSprintDetailRows.push([
        epic.epic.key,
        epic.epic.summary,
        "",
      ]);
    }
  }

  const epicSprintDetailWorksheet = XLSX.utils.aoa_to_sheet(epicSprintDetailRows);
  XLSX.utils.book_append_sheet(workbook, epicSprintDetailWorksheet, "Epic-Sprint Details");

  const headers = [
    "Epic Key",
    "Epic Summary",
    "Epic Status",
    "Epic Assignee",
    "Issue Key",
    "Issue Summary",
    "Issue Status",
    "Issue Assignee",
    "Issue Type",
    "Priority",
    "Story Points",
    "Sprint",
    "Fix Versions",
  ];

  for (const tab of FIX_VERSION_TABS) {
    const rows: (string | number)[][] = [];

    for (const epic of reportData.epics) {
      for (const statusKey of Object.keys(epic.breakdown_by_status)) {
        const statusData = epic.breakdown_by_status[statusKey];
        for (const issue of statusData.issues) {
          if (issueBelongsToFixVersion(issue, tab.id)) {
            rows.push([
              epic.epic.key,
              epic.epic.summary,
              epic.epic.status,
              epic.epic.assignee || "",
              issue.key,
              issue.summary,
              issue.status,
              issue.assignee || "",
              issue.issue_type,
              issue.priority || "",
              issue.story_points || "",
              issue.sprint || "",
              issue.fix_versions?.join("; ") || "",
            ]);
          }
        }
      }
    }

    if (rows.length > 0 || tab.id === "all") {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(workbook, worksheet, tab.label);
    }
  }

  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `epic-report-${timestamp}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
