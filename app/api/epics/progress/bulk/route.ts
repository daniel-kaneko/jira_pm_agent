import { NextRequest, NextResponse } from "next/server";
import { getConfig, getDefaultConfig } from "@/lib/jira";
import { handleGetEpicProgress } from "@/lib/jira/handlers";
import { RETRY_DELAY_MS, MAX_RETRIES } from "@/lib/constants";
import type { JiraProjectConfig } from "@/lib/jira/types";

type EpicProgressData = {
      epic: {
        key: string;
        key_link: string;
        summary: string;
        status: string;
        assignee: string | null;
      };
      progress: {
        total_issues: number;
        completed_issues: number;
        total_story_points: number;
        completed_story_points: number;
        percent_by_count: number;
        percent_by_points: number;
      };
      breakdown_by_status: Record<
        string,
        {
          count: number;
          story_points: number;
          issues: Array<{
            key: string;
            key_link: string;
            summary: string;
            status: string;
            assignee: string | null;
            story_points: number | null;
            issue_type: string;
          }>;
        }
      >;
};

/**
 * Check if an error is a rate limit error (429).
 */
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("429") ||
      error.message.includes("rate limit") ||
      error.message.toLowerCase().includes("too many requests")
    );
  }
  return false;
}

/**
 * Retry epic progress fetch with exponential backoff and rate limit handling.
 * @param config - Jira project configuration.
 * @param epicKey - Epic key to fetch progress for.
 * @returns Epic progress data.
 */
async function fetchEpicProgressWithRetry(
  config: JiraProjectConfig,
  epicKey: string
): Promise<EpicProgressData> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const progressResult = await handleGetEpicProgress(config, {
        epic_key: epicKey,
        include_subtasks: false,
      });

      return {
        epic: progressResult.epic,
        progress: progressResult.progress,
        breakdown_by_status: progressResult.breakdown_by_status,
      };
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES - 1;
      const isRateLimit = isRateLimitError(error);

      if (isLastAttempt) {
        throw error;
      }

      const delay = RETRY_DELAY_MS * Math.pow(2, attempt);

      if (isRateLimit) {
        console.log(
          `Rate limit detected for epic ${epicKey}, waiting ${delay}ms before retry (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
      } else {
        console.log(
          `Error fetching epic ${epicKey}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}):`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Max retries exceeded");
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { configId, epic_keys } = body;

    if (!epic_keys || !Array.isArray(epic_keys) || epic_keys.length === 0) {
      return NextResponse.json(
        { error: "epic_keys array is required and cannot be empty" },
        { status: 400 }
      );
    }

    const effectiveConfigId = configId || getDefaultConfig().id;
    const config = getConfig(effectiveConfigId);

    const results = await Promise.allSettled(
      epic_keys.map(async (epicKey: string) => {
        try {
          const data = await fetchEpicProgressWithRetry(config, epicKey);
          return {
            success: true,
            data,
          };
        } catch (error) {
          console.error(`Failed to get progress for epic ${epicKey}:`, error);
          return {
            success: false,
            epicKey,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    const successful: EpicProgressData[] = [];
    const failed: Array<{ epicKey: string; error: string }> = [];

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success && result.value.data) {
        successful.push(result.value.data);
      } else if (result.status === "fulfilled" && !result.value.success) {
        failed.push({
          epicKey: result.value.epicKey || "unknown",
          error: result.value.error || "Unknown error",
        });
      } else if (result.status === "rejected") {
        failed.push({
          epicKey: "unknown",
          error: result.reason instanceof Error ? result.reason.message : "Unknown error",
        });
      }
    }

    let retriedCount = 0;
    let retriedSucceeded = 0;

    if (failed.length > 0) {
      console.log(`Retrying ${failed.length} failed epic(s)...`);
      const retryResults = await Promise.allSettled(
        failed.map(async (failedItem) => {
          try {
            const data = await fetchEpicProgressWithRetry(config, failedItem.epicKey);
            retriedCount++;
            retriedSucceeded++;
            return {
              success: true,
              data,
            };
          } catch (error) {
            retriedCount++;
            console.error(
              `Retry failed for epic ${failedItem.epicKey}:`,
              error instanceof Error ? error.message : "Unknown error"
            );
            return {
              success: false,
              epicKey: failedItem.epicKey,
              error: error instanceof Error ? error.message : "Unknown error",
            };
          }
        })
      );

      for (const result of retryResults) {
        if (result.status === "fulfilled" && result.value.success && result.value.data) {
          successful.push(result.value.data);
        }
      }
    }

    return NextResponse.json({
      total_requested: epic_keys.length,
      total_succeeded: successful.length,
      retried_count: retriedCount,
      retried_succeeded: retriedSucceeded,
      results: successful,
    });
  } catch (error) {
    console.error("Bulk epic progress error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get bulk epic progress",
      },
      { status: 500 }
    );
  }
}
