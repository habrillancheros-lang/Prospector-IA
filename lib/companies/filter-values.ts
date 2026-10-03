export function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++)
      current.push(
        Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)),
      );
    previous = current;
  }
  return previous[b.length];
}

const aliases: Record<string, Record<string, string>> = {
  companyType: {
    pvt: "Private",
    "pvt ltd": "Private",
    "private limited": "Private",
    "public limited": "Public",
    "government organisation": "Govt Organisation",
    "government organization": "Govt Organisation",
  },
  location: {
    "bangalore, karnataka": "Bangalore/Bengaluru,Karnataka",
    "bengaluru, karnataka": "Bangalore/Bengaluru,Karnataka",
    "gurugram, haryana": "Gurgaon/Gurugram,Haryana",
    "hyderabad, telangana": "Hyderabad/Secunderabad,Telangana",
  },
};

export function aliasValue(field: string, value: string): string {
  return aliases[field]?.[fold(value)] ?? value.trim();
}
export function resolveFilterValue(field: string, value: string, vocabulary: readonly string[]) {
  const normalized = fold(value);
  const target = aliases[field]?.[normalized];
  const exact =
    vocabulary.find((candidate) => fold(candidate) === normalized) ??
    (target && vocabulary.find((candidate) => candidate === target));
  if (exact) return { value: exact, recognized: true, didYouMean: [] as string[] };
  const didYouMean = vocabulary
    .filter(
      (candidate) =>
        Math.abs(fold(candidate).length - normalized.length) <=
        Math.max(2, Math.floor(normalized.length * 0.3)),
    )
    .map((candidate) => ({ candidate, distance: distance(normalized, fold(candidate)) }))
    .filter((item) => item.distance <= Math.max(2, Math.floor(normalized.length * 0.3)))
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        (a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : 0),
    )
    .slice(0, 3)
    .map((item) => item.candidate);
  // Unknown requested values remain constraints; never silently broaden a query.
  return { value: value.trim(), recognized: false, didYouMean };
}
