# Trial Compass

A tool for patients (or anyone) to see, in plain language, what's actually
happening for a medical condition right now: which trials are recruiting,
how they break down by phase and status, and which FDA drug labels were
recently updated for it — all pulled live, no fake or seeded data.

Built for a biopharma hackathon (Pharma Hack Day, AWS Builder Loft, SF).
Problem statement: **treatment observability for patients** — help people
with serious or rare conditions understand what's available in a trial or
soon-to-be-approved.

## Try it

```bash
npm install
npm run dev
```

Then open `localhost:3000`, type a condition (e.g. "pancreatic cancer",
"ALS", "cystic fibrosis"), and hit Explore.

## What it does right now

**Landing page** — search any condition.

**Treatment Landscape page** (`/landscape/[condition]`):
- Real trial counts by status (recruiting / completed / terminated / etc.)
  from ClinicalTrials.gov's own totals — not a sample.
- Phase breakdown of currently-recruiting trials.
- Recently updated FDA drug labels that mention the condition, via openFDA.
- The full list of recruiting trials, each linking to its real
  ClinicalTrials.gov page.

Everything on this page is live data from two free, public, no-API-key
sources: [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api)
and [openFDA](https://open.fda.gov/apis/).

## What's coming next

**Explainable Trial Matcher** — the actual differentiator. You describe
yourself in plain language ("62, stage 3, had one round of chemo"), the app
extracts a structured profile, checks it against each trial's *real*
eligibility criteria text, and shows a verdict with a confidence score and
the exact sentence from the trial that drove the decision — not just a
black-box yes/no. Plus an audit trail and a "verify with your doctor"
disclaimer, since this is health data.

Also planned: pulling in [Convoke's](https://convoke.bio) drug pipeline
database (one of the hackathon's sponsors) for richer program/competitive
data than raw trial records alone.

## Stack

Next.js (App Router, TypeScript, Tailwind), no separate backend — API
routes double as the server. No database; everything is fetched live and
cached briefly at the edge.

## Ideas if you want to add something

This is intentionally left open — pick anything and go:

- Location-based sorting / "trials near me" using site geodata already in
  the ClinicalTrials.gov response
- Plain-language tooltips explaining what Phase 1/2/3/4 actually mean
- Save or compare a shortlist of trials
- A timeline view of FDA approvals for a condition over time
- Compare two conditions side by side
- Voice/chat interface instead of a form for the matcher intake
- Multi-language support for the plain-language summaries
- A "how to actually enroll" explainer per trial (contact info, next steps)

If you build something, keep it consistent with the rest: server-rendered
where possible, no data source that isn't real/live, and no client-side
API keys.
