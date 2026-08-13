export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
};

// Single source of truth — every explanation lives here exactly once. Sections below reference
// entries by key; contextual links elsewhere in the app point at the same entry's `id` anchor.
// Never write a second, slightly-different explanation of the same concept somewhere else.
export const FAQ_ENTRIES = {
  howSearchWorks: {
    id: "how-search-works",
    question: "How does search work?",
    answer:
      "Search pulls live data straight from ClinicalTrials.gov's own public API — every trial, " +
      "phase, and status you see is fetched in real time on each visit, not a stored copy.",
  },
  howProfileCreated: {
    id: "how-profile-created",
    question: "How is my patient profile created?",
    answer:
      "When you describe yourself in your own words, an LLM extracts a structured profile — age, " +
      "diagnosis, stage, prior treatments, biomarkers, comorbidities, location. It's instructed to " +
      "record only what you actually said, including explicit statements that something is absent " +
      "(e.g. \"no prior chemo\") — never to guess or infer anything you didn't state.",
  },
  howForAgainstJudgeWorks: {
    id: "how-for-against-judge-works",
    question: "How do FOR / AGAINST / JUDGE work?",
    answer:
      "For each trial, two independent AI agents build opposing cases from the same facts — one " +
      "arguing why you qualify (FOR), one arguing why you might not (AGAINST) — without seeing " +
      "each other's argument. A third Judge agent then reviews both against the trial's real " +
      "eligibility criteria and your profile, breaks the criteria into individual checkable items, " +
      "and reaches a final verdict. The Judge is explicitly told not to just average the two " +
      "arguments — either one may be wrong or overstated.",
  },
  whatConfidenceMeans: {
    id: "what-confidence-means",
    question: "What does the confidence score mean?",
    answer:
      "Confidence reflects how sure the assessment is in itself — not your odds of getting into " +
      "the trial or a treatment working for you. It starts as the Judge's own self-reported number, " +
      "then code constrains it: an UNKNOWN verdict is capped at 40%, an eligibility quote that " +
      "can't be verified against the trial's real text caps confidence at 50%, and a PASS verdict " +
      "based on checking less than half the trial's relevant criteria is also capped. A confident " +
      "number always has to be backed by real, checkable evidence.",
  },
  whyUnknown: {
    id: "why-unknown",
    question: "Why does Trial Compass say UNKNOWN?",
    answer:
      "UNKNOWN means there isn't enough information to reach a confident PASS or FAIL — either your " +
      "description didn't cover a fact the trial needs to check, or you haven't confirmed the basic " +
      "condition the trial treats. It is not a rejection. Trial Compass never treats \"you didn't " +
      "mention it\" as evidence that you don't have it.",
  },
  howTrackingWorks: {
    id: "how-tracking-works",
    question: "How does tracking work?",
    answer:
      "When you track a trial, a snapshot of its status, locations, eligibility criteria, " +
      "enrollment target, and key dates is saved in your browser (not a server account). \"Check " +
      "for updates\" re-fetches the trial and compares it against your saved snapshot using " +
      "deterministic code, never an AI guess, to detect what changed. An AI is only used to turn a " +
      "genuine eligibility-text change into a plain-language summary — every other change type " +
      "(status, location, dates, enrollment) is described with a fixed, factual template.",
  },
  howSourcesShown: {
    id: "how-sources-shown",
    question: "How are sources shown?",
    answer:
      "Every quoted criterion behind a verdict, or cited in a missing-information suggestion, is " +
      "checked in code against the trial's actual eligibility text before being shown to you. If a " +
      "quote can't be verified as real, you'll see a warning instead of a citation presented as fact.",
  },
  whatIsClinicalTrial: {
    id: "what-is-a-clinical-trial",
    question: "What is a clinical trial?",
    answer:
      "A research study that tests a treatment, drug, or intervention on real participants to see " +
      "whether it's safe and whether it works, following a formal, pre-registered protocol.",
  },
  whatArePhases: {
    id: "what-are-phases",
    question: "What do Phase 1/2/3/4 mean?",
    answer:
      "Phase 1 tests safety and dosage in a small group. Phase 2 tests effectiveness in a larger " +
      "group while still watching for safety issues. Phase 3 compares the treatment against " +
      "current standard care in a large group — often the step before FDA approval. Phase 4 " +
      "happens after approval, monitoring long-term effects in the general population.",
  },
  whatDoesRecruitingMean: {
    id: "what-does-recruiting-mean",
    question: "What does \"Recruiting\" mean?",
    answer:
      "The trial is actively enrolling participants right now. \"Not yet recruiting\" means it's " +
      "registered but hasn't opened enrollment. \"Active, not recruiting\" means it's ongoing but " +
      "not currently accepting new participants.",
  },
  whatDoesTerminatedMean: {
    id: "what-does-terminated-mean",
    question: "What does \"Terminated\" mean?",
    answer:
      "The trial was stopped before completion — for reasons that can include safety concerns, " +
      "funding, or low enrollment. It does not automatically mean the treatment failed.",
  },
  inclusionExclusionCriteria: {
    id: "inclusion-exclusion-criteria",
    question: "What are inclusion/exclusion criteria?",
    answer:
      "Inclusion criteria are requirements you must meet to join a trial (e.g. a specific diagnosis " +
      "or age range). Exclusion criteria are things that disqualify you (e.g. a certain prior " +
      "treatment). Trial Compass checks your stated profile against a trial's actual criteria text.",
  },
  isConfidenceChance: {
    id: "is-confidence-my-chance",
    question: "Is the confidence score my chance of getting into the trial?",
    answer:
      "No. It reflects how confident the assessment is in its own eligibility read — not your " +
      "probability of being accepted, or of a treatment working. Actual enrollment depends on a " +
      "formal screening process run by the trial's own study team.",
  },
  doesTrialCompassDecideEligibility: {
    id: "does-trial-compass-decide-eligibility",
    question: "Does Trial Compass decide eligibility?",
    answer:
      "No. Only a trial's own study team can determine actual eligibility, through their formal " +
      "screening process. This tool is meant to help you understand your options and prepare " +
      "informed questions — not to replace that process.",
  },
  whereDataComesFrom: {
    id: "where-data-comes-from",
    question: "Where does the data come from?",
    answer:
      "Trial listings and eligibility criteria come from ClinicalTrials.gov's public API. Drug " +
      "approval information comes from openFDA and FDA's own Novel Drug Approvals list. None of " +
      "this source text is edited or summarized by AI before being shown — only the interpretation " +
      "(verdicts, explanations) is AI-generated, and it's always tied back to the real source.",
  },
  howCurrentIsData: {
    id: "how-current-is-data",
    question: "How current is the information?",
    answer:
      "Data is fetched live from the source on each visit (cached briefly, up to an hour, to avoid " +
      "overloading the public APIs) — it reflects what's currently posted on ClinicalTrials.gov and " +
      "openFDA, not a static snapshot from whenever this tool was built.",
  },
} as const;

export type FaqEntryKey = keyof typeof FAQ_ENTRIES;

export const HOW_IT_WORKS_SECTION: FaqEntryKey[] = [
  "howSearchWorks",
  "howProfileCreated",
  "howForAgainstJudgeWorks",
  "whatConfidenceMeans",
  "whyUnknown",
  "howTrackingWorks",
  "howSourcesShown",
];

export const FAQ_SECTION: FaqEntryKey[] = [
  "whatIsClinicalTrial",
  "whatArePhases",
  "whatDoesRecruitingMean",
  "whatDoesTerminatedMean",
  "inclusionExclusionCriteria",
  "whyUnknown",
  "isConfidenceChance",
  "doesTrialCompassDecideEligibility",
  "whereDataComesFrom",
  "howCurrentIsData",
];

export type ResourceLink = { label: string; url: string; description: string };

// All verified real, current URLs — checked before adding, not guessed.
export const RESOURCES: ResourceLink[] = [
  {
    label: "ClinicalTrials.gov",
    url: "https://clinicaltrials.gov/",
    description: "The official U.S. registry of clinical studies — the source of every trial shown here.",
  },
  {
    label: "Learn About Studies (ClinicalTrials.gov)",
    url: "https://clinicaltrials.gov/study-basics/learn-about-studies",
    description: "ClinicalTrials.gov's own guide to how studies work and what to consider before joining one.",
  },
  {
    label: "NIH — Clinical Research Trials and You",
    url: "https://www.nih.gov/health-information/nih-clinical-research-trials-you",
    description: "The National Institutes of Health's patient-facing guide to clinical research.",
  },
  {
    label: "NCI — Cancer Clinical Trials",
    url: "https://www.cancer.gov/research/participate/clinical-trials",
    description: "The National Cancer Institute's guide specifically for cancer clinical trials.",
  },
  {
    label: "openFDA",
    url: "https://open.fda.gov/",
    description: "FDA's open data platform — the source of the drug label and approval data shown here.",
  },
  {
    label: "U.S. Food and Drug Administration",
    url: "https://www.fda.gov/",
    description: "The federal agency responsible for drug approval in the United States.",
  },
];
