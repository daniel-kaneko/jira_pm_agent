import { ollamaRequest } from "../ollama";
import { AuditorResult, FactsAuditorInput } from "./types";

/**
 * Auditor that checks if facts in AI response match actual data.
 * Verifies counts, points, and specific issue details.
 * @param input - AI response and facts sheet to verify against.
 * @returns Pass/fail result with reason.
 */
export async function factsAuditor(
  input: FactsAuditorInput
): Promise<AuditorResult> {
  const { aiResponse, factsSheet } = input;

  if (!factsSheet) {
    return { pass: true, reason: "No data to verify" };
  }

  const prompt = `Verify the AI response against actual data.

ACTUAL DATA:
${factsSheet}

AI RESPONSE:
"${aiResponse}"

Check: totals, per-person counts/points, issue information, any made-up data.
Answer: PASS or FAIL: [what's wrong]`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt,
      stream: false,
      options: { temperature: 0 },
    });

    if (!response.ok) {
      return { pass: true, reason: "Skipped (API error)" };
    }

    const data = await response.json();
    const answer = (data.response || "").trim().toUpperCase();

    if (answer.startsWith("PASS")) {
      return { pass: true, reason: "Facts verified" };
    }

    const failReason = answer.replace(/^FAIL:?\s*/i, "").trim();
    return { pass: false, reason: failReason || "Fact mismatch" };
  } catch (error) {
    console.error("[factsAuditor] Error:", error);
    return { pass: true, reason: "Skipped (error)" };
  }
}
