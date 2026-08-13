const BASE_URL = "https://api.fda.gov/drug/label.json";

export type LabelRecord = {
  brandName: string;
  genericName: string;
  manufacturer: string;
  effectiveTime: string; // YYYYMMDD
  indicationSnippet: string;
};

export async function fetchRecentLabels(condition: string, limit = 5): Promise<LabelRecord[]> {
  // Over-fetch since some records lack openfda metadata and get filtered out below.
  const params = new URLSearchParams({
    search: `indications_and_usage:"${condition}"`,
    sort: "effective_time:desc",
    limit: String(limit * 3),
  });

  const res = await fetch(`${BASE_URL}?${params}`, { next: { revalidate: 3600 } });
  if (res.status === 404) return []; // openFDA returns 404 when nothing matches
  if (!res.ok) throw new Error(`openFDA request failed: ${res.status}`);
  const data = await res.json();

  return (data.results ?? [])
    .map((r: Record<string, any>) => {
      const openfda = r.openfda ?? {};
      const indication: string = r.indications_and_usage?.[0] ?? "";
      return {
        brandName: openfda.brand_name?.[0] ?? openfda.generic_name?.[0] ?? "",
        genericName: openfda.generic_name?.[0] ?? "",
        manufacturer: openfda.manufacturer_name?.[0] ?? "",
        effectiveTime: r.effective_time ?? "",
        indicationSnippet: indication.slice(0, 200),
      };
    })
    .filter((label: LabelRecord) => label.brandName !== "") // drop records with no identifiable drug name
    .slice(0, limit);
}
