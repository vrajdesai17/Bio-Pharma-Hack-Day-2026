const BASE_URL = "https://www.fda.gov/drugs/novel-drug-approvals-fda/novel-drug-approvals";

// FDA.gov blocks requests without a browser-like User-Agent (returns 404).
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export type NovelApproval = {
  drugName: string;
  activeIngredient: string;
  approvalDate: string; // ISO yyyy-mm-dd
  use: string;
};

function toIsoDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseTable(html: string): NovelApproval[] {
  const tableStart = html.indexOf("<table");
  const tableEnd = html.indexOf("</table>", tableStart);
  if (tableStart === -1 || tableEnd === -1) return [];

  const tbodyStart = html.indexOf("<tbody", tableStart);
  const tbody = html.slice(tbodyStart, tableEnd);

  const rows: NovelApproval[] = [];
  for (const rowMatch of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1]));
    // Columns: No. | Drug Name | Active Ingredient | Approval Date | FDA-approved use
    if (cells.length < 5) continue;
    const [, drugName, activeIngredient, approvalDateRaw, use] = cells;
    const approvalDate = toIsoDate(approvalDateRaw);
    if (!drugName || !approvalDate) continue;
    rows.push({ drugName, activeIngredient, approvalDate, use });
  }
  return rows;
}

async function fetchYear(year: number): Promise<NovelApproval[]> {
  const res = await fetch(`${BASE_URL}-${year}`, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  return parseTable(await res.text());
}

export async function fetchRecentNovelApprovals(condition: string, limit = 5): Promise<NovelApproval[]> {
  const currentYear = new Date().getFullYear();
  const [thisYear, lastYear] = await Promise.all([fetchYear(currentYear), fetchYear(currentYear - 1)]);
  const all = [...thisYear, ...lastYear];

  // Match on ALL significant condition words (AND, not OR). A single-word match ("cancer" alone,
  // "disease" alone) is too generic — it'd match nearly every oncology or rare-disease approval
  // regardless of which one. Requiring every word present is still looser than an exact phrase
  // (indication text says "pancreatic ductal adenocarcinoma", not "pancreatic cancer" verbatim)
  // while actually being specific to the condition searched.
  const words = condition.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const matches = all.filter((a) => {
    const use = a.use.toLowerCase();
    return words.length > 0 && words.every((w) => use.includes(w));
  });

  matches.sort((a, b) => (a.approvalDate < b.approvalDate ? 1 : -1));
  return matches.slice(0, limit);
}
