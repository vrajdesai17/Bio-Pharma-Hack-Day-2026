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

// Defensive: structured-output strict mode guarantees valid JSON shape, not clean field *content* —
// the model occasionally leaks a fragment of its own JSON into a string value. Cut it off if so.
function stripLeakedJson(value: string): string {
  const leakMarkers = ['","confidence":', '","reasoning":', '","citedCriteria":', '","verdict":', '","argument":', '","summary":'];
  let cut = value.length;
  for (const marker of leakMarkers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) cut = Math.min(cut, idx);
  }
  return value.slice(0, cut).trim();
}

// Any prompt claiming to quote source text gets checked against it — this is the actual proof,
// not the prompt instruction. Strips bullet markers and collapses whitespace/newlines so
// formatting differences don't cause false negatives, then checks it's a real substring of the
// trial's own eligibility text. False negatives (a real quote marked unverified over a trivial
// character difference) are an acceptable failure direction here; false positives are not.
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[*\-•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCitationVerified(citedText: string, eligibilityCriteria: string): boolean {
  const needle = normalizeForMatch(citedText);
  if (!needle) return false;
  return normalizeForMatch(eligibilityCriteria).includes(needle);
}

// ---------------------------------------------------------------------------
// Eligibility matcher: Qualification / Disqualification / Judge
// ---------------------------------------------------------------------------
// Two independent LLM calls argue opposite sides from the same facts (run in parallel — neither
// sees the other's argument), then a third call judges between them against the real criteria and
// profile. The judge's own output is then, itself, not trusted blindly: every cited criterion is
// checked against the trial's real text, criteria the judge couldn't verify get forced to
// "unknown" rather than trusted, and confidence is capped in code based on verification + how much
// of the trial was actually checkable — not just what the model claims.

const ArgumentSchema = z.object({
  argument: z.string(),
  citedCriteria: z.array(z.string()),
});

const QUALIFICATION_SYSTEM_PROMPT =
  "Build the strongest HONEST case for why this patient QUALIFIES for this trial, based only on " +
  "the trial's real eligibility criteria and what the patient actually stated about themselves. " +
  "Do not invent or infer facts the patient didn't state. citedCriteria: verbatim quotes (one " +
  "sentence/bullet each) from the eligibility criteria text that support qualification — never " +
  "paraphrase. If there is no honest case to be made, say so plainly in 'argument' rather than " +
  "stretching, and leave citedCriteria empty.";

const DISQUALIFICATION_SYSTEM_PROMPT =
  "Build the strongest HONEST case for why this patient may NOT qualify for this trial, based only " +
  "on the trial's real eligibility criteria and what the patient actually stated about themselves. " +
  "Do not invent or infer facts the patient didn't state. citedCriteria: verbatim quotes (one " +
  "sentence/bullet each) from the eligibility criteria text that raise concerns — never paraphrase. " +
  "If there is no honest concern to raise, say so plainly in 'argument' rather than manufacturing " +
  "one, and leave citedCriteria empty.";

async function getArgument(
  systemPrompt: string,
  profile: PatientProfile,
  profileText: string,
  trial: { title: string; eligibilityCriteria: string }
) {
  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          `Patient profile (structured):\n${JSON.stringify(profile, null, 2)}\n\n` +
          `Patient's own words: "${profileText}"\n\n` +
          `Trial: ${trial.title}\n\n` +
          `Eligibility criteria:\n${trial.eligibilityCriteria || "(no eligibility criteria text available for this trial)"}`,
      },
    ],
    text: { format: zodTextFormat(ArgumentSchema, "argument") },
  });
  const parsed = response.output_parsed;
  if (!parsed) return null;
  return {
    argument: stripLeakedJson(parsed.argument),
    citedCriteria: parsed.citedCriteria.map(stripLeakedJson).filter(Boolean),
  };
}

const CriterionVerdictSchema = z.object({
  criterion: z.string(),
  status: z.enum(["met", "not_met", "unknown"]),
});

const JudgeSchema = z.object({
  verdict: z.enum(["PASS", "FAIL", "UNKNOWN"]),
  confidence: z.number(),
  summary: z.string(),
  primaryCitation: z.string(),
  criteria: z.array(CriterionVerdictSchema),
});

const JUDGE_SYSTEM_PROMPT =
  "You are the judge. You are given a qualification argument (FOR), a disqualification argument " +
  "(AGAINST), the trial's real eligibility criteria, and the patient's profile. Weigh them against " +
  "the actual criteria and profile yourself — either argument may be wrong, overstated, or based on " +
  "a misreading; do not simply average or split the difference between them. " +
  "criteria: break the eligibility criteria into individual checkable items. For each, quote it " +
  "verbatim (one sentence/bullet) and assess: 'met' — a stated patient fact satisfies it. " +
  "'not_met' — a stated patient fact conflicts with it. 'unknown' — the patient's info doesn't " +
  "confirm or deny it (this is the default when nothing was stated — not 'not_met'). " +
  "verdict: 'PASS' only if the checkable criteria that matter are met and none are clearly failed. " +
  "'FAIL' only if a fact the patient actually stated directly conflicts with a criterion — never " +
  "FAIL just because a required fact was never mentioned, that is 'unknown', not a conflict. " +
  "'UNKNOWN' otherwise, including whenever there isn't enough patient information to reach a " +
  "confident PASS or FAIL — most importantly when the patient hasn't even confirmed having the " +
  "condition this trial treats. " +
  "confidence: 0-100, calibrated to how many criteria you could actually check from stated facts, " +
  "not how clean the trial's own criteria are and not how confident the FOR or AGAINST argument " +
  "sounded. A verdict resting on a near-empty patient profile must carry low confidence whichever " +
  "verdict it is. " +
  "primaryCitation: the single criterion (verbatim, from your criteria list) that most drove the " +
  "verdict. summary: 1-2 plain language sentences for the patient. " +
  "Every field is plain text only — never include JSON syntax, quotation-mark-delimited key names, " +
  "or any part of this schema's own field names inside a field's value.";

async function getJudgeVerdict(
  profile: PatientProfile,
  profileText: string,
  trial: { title: string; eligibilityCriteria: string },
  qualification: { argument: string; citedCriteria: string[] },
  disqualification: { argument: string; citedCriteria: string[] }
) {
  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Patient profile (structured):\n${JSON.stringify(profile, null, 2)}\n\n` +
          `Patient's own words: "${profileText}"\n\n` +
          `Trial: ${trial.title}\n\n` +
          `Eligibility criteria:\n${trial.eligibilityCriteria || "(no eligibility criteria text available for this trial)"}\n\n` +
          `FOR (qualification argument): ${qualification.argument}\n` +
          `Cited by FOR: ${qualification.citedCriteria.join(" | ") || "(none)"}\n\n` +
          `AGAINST (disqualification argument): ${disqualification.argument}\n` +
          `Cited by AGAINST: ${disqualification.citedCriteria.join(" | ") || "(none)"}`,
      },
    ],
    text: { format: zodTextFormat(JudgeSchema, "judge_verdict") },
  });
  return response.output_parsed;
}

export type CriterionVerdict = { criterion: string; status: "met" | "not_met" | "unknown" };

export type TrialMatch = {
  verdict: "PASS" | "FAIL" | "UNKNOWN";
  verdictAdjusted: boolean;
  confidence: number;
  reasoning: string;
  citedCriteria: string;
  citationVerified: boolean;
  forArgument: string;
  againstArgument: string;
  criteria: CriterionVerdict[];
  evidenceCoverage: { checkable: number; total: number };
};

// The judge's top-level verdict and its own per-criterion breakdown are two separate fields from
// the same call — nothing guarantees they agree, and the criteria array has already been corrected
// against real source text while the verdict hasn't. Downgrade to UNKNOWN on any contradiction
// rather than trust a verdict that doesn't follow from the judge's own (verified) breakdown.
function reconcileVerdict(
  rawVerdict: TrialMatch["verdict"],
  criteria: CriterionVerdict[]
): { verdict: TrialMatch["verdict"]; adjusted: boolean } {
  const hasVerifiedNotMet = criteria.some((c) => c.status === "not_met");
  const checkableCount = criteria.filter((c) => c.status !== "unknown").length;

  if (rawVerdict === "PASS" && hasVerifiedNotMet) return { verdict: "UNKNOWN", adjusted: true };
  if (rawVerdict === "FAIL" && !hasVerifiedNotMet) return { verdict: "UNKNOWN", adjusted: true };
  if (rawVerdict === "PASS" && checkableCount === 0) return { verdict: "UNKNOWN", adjusted: true };
  return { verdict: rawVerdict, adjusted: false };
}

// Code-enforced backstop for the calibration rules in JUDGE_SYSTEM_PROMPT — those are instructions
// the model can still ignore on any given call. This runs regardless of what the model actually did.
function applyConfidenceGuardrails(
  verdict: TrialMatch["verdict"],
  rawConfidence: number,
  citationVerified: boolean,
  checkable: number,
  total: number
): number {
  let confidence = Math.round(Math.max(0, Math.min(100, rawConfidence)));
  if (verdict === "UNKNOWN") confidence = Math.min(confidence, 40);
  if (!citationVerified) confidence = Math.min(confidence, 50);
  // Low overall coverage only suppresses confidence for PASS, which needs most applicable criteria
  // confirmed met. A FAIL needs only one verified, stated conflict — the other criteria become
  // irrelevant once disqualified, so their being unchecked shouldn't cap confidence in the FAIL.
  if (verdict === "PASS" && total > 0 && checkable / total < 0.5) confidence = Math.min(confidence, 50);
  return confidence;
}

export async function evaluateTrialMatch(
  profile: PatientProfile,
  profileText: string,
  trial: { title: string; eligibilityCriteria: string }
): Promise<TrialMatch | null> {
  if (!isLLMConfigured()) return null;

  const [qualification, disqualification] = await Promise.all([
    getArgument(QUALIFICATION_SYSTEM_PROMPT, profile, profileText, trial),
    getArgument(DISQUALIFICATION_SYSTEM_PROMPT, profile, profileText, trial),
  ]);
  if (!qualification || !disqualification) return null;

  const judge = await getJudgeVerdict(profile, profileText, trial, qualification, disqualification);
  if (!judge) return null;

  // Don't trust the judge's own citations blindly: verify each criterion quote against the real
  // eligibility text. A status we can't verify the source of gets forced to "unknown" — we won't
  // count a "met"/"not_met" call as checkable if we can't confirm what it was even checked against.
  const criteria: CriterionVerdict[] = judge.criteria.map((c) => {
    const criterion = stripLeakedJson(c.criterion);
    const verified = isCitationVerified(criterion, trial.eligibilityCriteria);
    return { criterion, status: verified ? c.status : "unknown" };
  });

  const primaryCitation = stripLeakedJson(judge.primaryCitation);
  const citationVerified = isCitationVerified(primaryCitation, trial.eligibilityCriteria);

  const checkable = criteria.filter((c) => c.status !== "unknown").length;
  const total = criteria.length;

  const { verdict, adjusted: verdictAdjusted } = reconcileVerdict(judge.verdict, criteria);
  const confidence = applyConfidenceGuardrails(verdict, judge.confidence, citationVerified, checkable, total);

  return {
    verdict,
    verdictAdjusted,
    confidence,
    reasoning: stripLeakedJson(judge.summary),
    citedCriteria: primaryCitation,
    citationVerified,
    forArgument: qualification.argument,
    againstArgument: disqualification.argument,
    criteria,
    evidenceCoverage: { checkable, total },
  };
}

// ---------------------------------------------------------------------------
// On-demand trial insights: Missing Information + Simplified language
// ---------------------------------------------------------------------------
// Both are called per-trial, only when a patient actually digs into that specific trial — not
// computed upfront for every trial in a match batch. Both operate only on criteria the caller has
// already independently re-verified against the trial's real eligibility text (done in the API
// route, not trusted from the client).

const MissingInfoItemSchema = z.object({
  criterion: z.string(),
  whyItMatters: z.string(),
});

const MissingInfoSchema = z.object({
  items: z.array(MissingInfoItemSchema),
});

const MISSING_INFO_SYSTEM_PROMPT =
  "You are given a list of this trial's eligibility criteria that could not be checked against the " +
  "patient's stated information. Pick the 1 to 3 criteria from THIS LIST — never invent a criterion " +
  "not listed here — that would most change the eligibility assessment if the patient provided that " +
  "information. Skip criteria that are minor or unlikely to change the outcome. For each one you " +
  "pick, quote it verbatim from the list and explain in one short plain-language sentence why " +
  "knowing it matters. If none of the unknown criteria would meaningfully change the assessment, " +
  "return an empty list rather than picking something unimportant.";

export type MissingInfoItem = { criterion: string; whyItMatters: string };

function isAmongProvided(candidate: string, provided: string[]): boolean {
  const needle = normalizeForMatch(candidate);
  if (!needle) return false;
  return provided.some((p) => {
    const hay = normalizeForMatch(p);
    return hay.includes(needle) || needle.includes(hay);
  });
}

export async function getMissingInformation(
  profile: PatientProfile,
  trial: { title: string },
  unknownCriteria: string[]
): Promise<MissingInfoItem[]> {
  if (!isLLMConfigured() || unknownCriteria.length === 0) return [];

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: MISSING_INFO_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Patient profile (structured):\n${JSON.stringify(profile, null, 2)}\n\n` +
          `Trial: ${trial.title}\n\n` +
          `Unknown criteria (choose only from this list):\n${unknownCriteria.map((c) => `- ${c}`).join("\n")}`,
      },
    ],
    text: { format: zodTextFormat(MissingInfoSchema, "missing_info") },
  });

  const parsed = response.output_parsed;
  if (!parsed) return [];

  // Only trust items whose cited criterion actually corresponds to one we provided — never
  // display a "missing fact" the model invented that wasn't in the real unknown-criteria list.
  return parsed.items
    .map((item) => ({
      criterion: stripLeakedJson(item.criterion),
      whyItMatters: stripLeakedJson(item.whyItMatters),
    }))
    .filter((item) => isAmongProvided(item.criterion, unknownCriteria))
    .slice(0, 3);
}

const SimplifiedCriteriaSchema = z.object({
  standard: z.array(z.string()),
  simple: z.array(z.string()),
});

const SIMPLIFY_SYSTEM_PROMPT =
  "You will be given a numbered list of clinical trial eligibility criteria. Rewrite each one at " +
  "two reading levels, without changing what it means, adding information it doesn't contain, or " +
  "softening/strengthening the requirement — only make the wording more accessible. " +
  "standard: a moderately plain rewrite that keeps necessary medical terms but explains them briefly. " +
  "simple: a short, plain-language sentence a patient with no medical background could understand, " +
  "avoiding jargon entirely. Return exactly one entry per criterion in each array, in the same order " +
  "as given.";

export async function simplifyCriteria(
  criteria: string[]
): Promise<{ standard: string[]; simple: string[] } | null> {
  if (!isLLMConfigured()) return null;
  if (criteria.length === 0) return { standard: [], simple: [] };

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: SIMPLIFY_SYSTEM_PROMPT },
      { role: "user", content: criteria.map((c, i) => `${i + 1}. ${c}`).join("\n") },
    ],
    text: { format: zodTextFormat(SimplifiedCriteriaSchema, "simplified_criteria") },
  });

  const parsed = response.output_parsed;
  if (!parsed) return null;
  // Defensive: if the model returns a misaligned count, we can't safely index-match it back to the
  // original criteria — refuse rather than risk showing the wrong simplification for a criterion.
  if (parsed.standard.length !== criteria.length || parsed.simple.length !== criteria.length) return null;

  return {
    standard: parsed.standard.map(stripLeakedJson),
    simple: parsed.simple.map(stripLeakedJson),
  };
}

// ---------------------------------------------------------------------------
// Change feed: eligibility-text diff summary (the one change type worth an LLM call)
// ---------------------------------------------------------------------------
// Every other tracked change (status, locations, enrollment, dates) is a simple structured fact —
// see describeChange() in lib/trialDiff.ts, pure templates, no LLM. Eligibility criteria is the one
// field that's free-form text where "what changed" genuinely benefits from summarization rather
// than just saying "it changed, go read both versions yourself."

const EligibilityChangeSummarySchema = z.object({
  summary: z.string(),
});

const ELIGIBILITY_CHANGE_SYSTEM_PROMPT =
  "You are given the OLD and NEW text of a clinical trial's eligibility/participation requirements " +
  "section. In one plain-language sentence, describe what text was added, removed, or altered — " +
  "state directly what's different, don't hedge about whether it technically counts as a formal " +
  "'eligibility criterion' versus a related requirement like a procedure or visit; anything a " +
  "patient would need to know about is worth stating plainly. Do not describe anything that's " +
  "identical in both versions. Do not invent a difference that isn't actually there — if the " +
  "wording differs but the meaning is the same, say the change is minor/wording-only.";

export async function summarizeEligibilityChange(before: string, after: string): Promise<string | null> {
  if (!isLLMConfigured()) return null;

  const client = new OpenAI();
  const response = await client.responses.parse({
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: ELIGIBILITY_CHANGE_SYSTEM_PROMPT },
      { role: "user", content: `OLD:\n${before}\n\nNEW:\n${after}` },
    ],
    text: { format: zodTextFormat(EligibilityChangeSummarySchema, "eligibility_change_summary") },
  });

  const parsed = response.output_parsed;
  return parsed ? stripLeakedJson(parsed.summary) : null;
}
