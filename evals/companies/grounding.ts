export function isReturnedLocation(name: string, records: readonly { location?: string | null }[]) {
  return records.some((record) => record.location?.split(",").some((part) => part.trim() === name));
}

export function recommendationLinesMatch(
  answer: string,
  records: readonly { name: string; score: number }[],
) {
  const lines = [...answer.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1]);
  return (
    lines.length === records.length &&
    lines.every((line, index) => {
      const company = records[index];
      if (!line.includes(company.name)) return false;
      const score = line.match(/score\s*[:*—–-]*\s*(\d+(?:\.\d+)?)/i)?.[1];
      if (!score || (score.includes(".") && score.split(".")[1].length > 1)) return false;
      return Math.abs(Number(score) - company.score) <= (score.includes(".") ? 0.051 : 0.501);
    })
  );
}
