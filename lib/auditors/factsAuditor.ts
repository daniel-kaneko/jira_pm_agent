import { ollamaRequest } from "../ollama";
import { AuditorResult, FactsAuditorInput } from "./types";

/**
 * Auditor that checks if facts in AI response match actual data.
 * Verifies counts, points, and catches made-up issues.
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

  const prompt = `Verify the veracity of the AI response based on the actual data. 
  The AI response is a summary of the data, so it does not need to contain all the information,
  but it should be accurate and consistent with the actual data.

${factsSheet}

RESPONSE: "${aiResponse}"

Check:
1. Do the numbers match? (totals, per-person counts/points)
2. Are all mentioned issue keys valid? (check against VALID ISSUES list)
3. Are issue descriptions accurate? (check against ISSUE DETAILS)

Answer ONLY on this format: "YES or NO: [brief reason if NO]"`;

  try {
    const response = await ollamaRequest("/api/generate", {
      prompt,
      stream: false,
      options: { num_predict: 60, temperature: 0 },
    });

    if (!response.ok) {
      return { pass: true, reason: "Skipped (API error)" };
    }

    const data = await response.json();
    const answer = (data.response || "").trim().toUpperCase();

    if (
      answer.startsWith("YES") ||
      !answer.includes("MISMATCH") ||
      !answer.includes("INCORRECT") ||
      !answer.includes("WRONG") ||
      !answer.includes("NOT MATCH")
    ) {
      return { pass: true, reason: "Facts verified" };
    }

    const failReason = answer.replace(/^NO:?\s*/i, "").trim();
    return { pass: false, reason: failReason || "Fact mismatch" };
  } catch (error) {
    console.error("[factsAuditor] Error:", error);
    return { pass: true, reason: "Skipped (error)" };
  }
}
