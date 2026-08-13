import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const OPENAI_MODEL = "gpt-5.4";

export function isLLMConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const PatientProfileSchema = z.object({
  age: z.number().nullable(),
  diagnosis: z.string().nullable(),
  stage: z.string().nullable(),
  priorTreatments: z.array(z.string()),
  biomarkers: z.array(z.string()),
  comorbidities: z.array(z.string()),
  location: z.string().nullable(),
});

export type PatientProfile = z.infer<typeof PatientProfileSchema>;

const EMPTY_PROFILE: PatientProfile = {
  age: null,
  diagnosis: null,
  stage: null,
  priorTreatments: [],
  biomarkers: [],
  comorbidities: [],
  location: null,
};

const SYSTEM_PROMPT =
  "Extract a structured clinical profile from the patient's own description of themselves. " +
  "Use null (or an empty array) only for fields the patient did not address at all. " +
  "If the patient explicitly states the absence of something (e.g. 'no prior chemo', 'no other " +
  "health conditions'), record that as an entry in the relevant array (e.g. 'none — no prior " +
  "chemotherapy') rather than leaving it empty — this distinction matters later for checking " +
  "trial eligibility criteria that require the absence of a treatment or condition. " +
  "Never guess or infer beyond what's stated.";

export async function extractProfile(
  freeText: string
): Promise<{ profile: PatientProfile; stubbed: boolean }> {
  if (!isLLMConfigured()) {
    return { profile: EMPTY_PROFILE, stubbed: true };
  }

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: freeText },
    ],
    text: { format: zodTextFormat(PatientProfileSchema, "patient_profile") },
  });

  return { profile: response.output_parsed ?? EMPTY_PROFILE, stubbed: false };
}

export const TrialMatchSchema = z.object({
  verdict: z.enum(["match", "possible", "unclear", "no_match"]),
  confidence: z.number(),
  reasoning: z.string(),
  citedCriteria: z.string(),
});

export type TrialMatch = z.infer<typeof TrialMatchSchema> & { citationVerified: boolean };

const MATCH_SYSTEM_PROMPT =
  "You are checking whether a patient likely qualifies for a clinical trial, based only on the " +
  "trial's own eligibility criteria text and what the patient has said about themselves. " +
  "Do not assume anything the patient didn't state — a field marked 'not mentioned' means unknown, " +
  "not absent. " +
  "verdict: 'match' — the patient's stated facts satisfy the criteria you can check. " +
  "'possible' — nothing stated rules them out, but key criteria depend on facts not mentioned. " +
  "'no_match' — a fact the patient actually STATED directly conflicts with a criterion (e.g. they " +
  "described something that meets an exclusion criterion, or a fact they gave clearly fails a " +
  "specific inclusion requirement). Never use 'no_match' just because a required diagnosis or fact " +
  "was never mentioned — an unconfirmed requirement is missing information, not a stated conflict, " +
  "and is 'unclear' or 'possible', not 'no_match'. " +
  "'unclear' — the eligibility criteria text is missing, empty, or too vague to evaluate, OR the " +
  "patient's own description is too sparse to evaluate this trial at all — most importantly, when " +
  "they haven't even confirmed having the condition this trial treats, no verdict about specific " +
  "criteria is possible yet. " +
  "confidence: 0-100. This is NOT 'how sure am I nothing rules them out', and it is NOT 'how sure am " +
  "I this required fact was never mentioned' — neither the absence of a stated conflict nor the " +
  "absence of a stated confirmation is evidence of anything. Calibrate to how much you can actually " +
  "verify from what the patient said, in either direction: 80-100 only when stated facts directly " +
  "support or directly conflict with most of what matters. 40-79 when some criteria are verifiable " +
  "but real gaps remain. Below 40 when the patient's description gives you almost nothing to check " +
  "against this trial in either direction — including, always, when they haven't even confirmed they " +
  "have the condition this trial treats. A verdict built on a near-empty patient description must " +
  "carry low confidence, whichever verdict it is, no matter how clean the trial's own criteria are. " +
  "citedCriteria: quote exactly ONE sentence or bullet point from the eligibility criteria text " +
  "below — the single one that most drove your verdict — copied verbatim, never paraphrased and " +
  "never multiple bullets or a full paragraph. If the criteria text is empty, say so instead of " +
  "inventing a quote. " +
  "reasoning: one or two sentences explaining the verdict in plain language for the patient. " +
  "Every field is plain text only — never include JSON syntax, quotation-mark-delimited key names, " +
  "or any part of this schema's own field names inside a field's value.";

// Defensive: structured-output strict mode guarantees valid JSON shape, not clean field *content* —
// the model occasionally leaks a fragment of its own JSON into a string value. Cut it off if so.
function stripLeakedJson(value: string): string {
  const leakMarkers = ['","confidence":', '","reasoning":', '","citedCriteria":', '","verdict":'];
  let cut = value.length;
  for (const marker of leakMarkers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) cut = Math.min(cut, idx);
  }
  return value.slice(0, cut).trim();
}

// The prompt asks the model to copy citedCriteria verbatim, but nothing enforces that — this is
// the actual proof. Strips bullet markers and collapses whitespace/newlines so formatting
// differences don't cause false negatives, then checks it's a real substring of the trial's own
// eligibility text. False negatives (a real quote marked unverified over a trivial character
// difference) are an acceptable failure direction here; false positives are not.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*\-•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCitationVerified(citedCriteria: string, eligibilityCriteria: string): boolean {
  const needle = normalizeForMatch(citedCriteria);
  if (!needle) return false;
  return normalizeForMatch(eligibilityCriteria).includes(needle);
}

// Code-enforced backstop for the confidence calibration rules in MATCH_SYSTEM_PROMPT — those are
// instructions the model can still ignore on any given call. This runs regardless of what the
// model actually did.
function applyConfidenceGuardrails(
  verdict: TrialMatch["verdict"],
  rawConfidence: number,
  citationVerified: boolean
): number {
  let confidence = Math.round(Math.max(0, Math.min(100, rawConfidence)));
  if (verdict === "unclear") confidence = Math.min(confidence, 40);
  if (!citationVerified) confidence = Math.min(confidence, 50);
  return confidence;
}

export async function evaluateTrialMatch(
  profile: PatientProfile,
  profileText: string,
  trial: { title: string; eligibilityCriteria: string }
): Promise<TrialMatch | null> {
  if (!isLLMConfigured()) return null;

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: MATCH_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Patient profile (structured):\n${JSON.stringify(profile, null, 2)}\n\n` +
          `Patient's own words: "${profileText}"\n\n` +
          `Trial: ${trial.title}\n\n` +
          `Eligibility criteria:\n${trial.eligibilityCriteria || "(no eligibility criteria text available for this trial)"}`,
      },
    ],
    text: { format: zodTextFormat(TrialMatchSchema, "trial_match") },
  });

  const parsed = response.output_parsed;
  if (!parsed) return null;

  const reasoning = stripLeakedJson(parsed.reasoning);
  const citedCriteria = stripLeakedJson(parsed.citedCriteria);
  const citationVerified = isCitationVerified(citedCriteria, trial.eligibilityCriteria);
  const confidence = applyConfidenceGuardrails(parsed.verdict, parsed.confidence, citationVerified);

  return { ...parsed, reasoning, citedCriteria, citationVerified, confidence };
}
