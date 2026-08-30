export function parseAppendOnlyJournal<T>(text: string): T[] {
  const lines = text.split("\n");
  const completeTail = text.endsWith("\n");
  const records: T[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      if (!completeTail && index === lines.length - 1) break;
      throw new Error(`Append-only checkpoint journal is corrupt at line ${index + 1}.`, { cause: error });
    }
  }
  return records;
}

export function mergeLatestByKey<T extends { key: string }>(...collections: ReadonlyArray<readonly T[]>) {
  const latest = new Map<string, T>();
  for (const collection of collections) {
    for (const record of collection) latest.set(record.key, record);
  }
  return [...latest.values()];
}

export function latestRecordByKey<T extends { key: string }>(records: readonly T[], key: string) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index]!.key === key) return records[index]!;
  }
  return null;
}
