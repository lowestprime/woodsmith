export async function executeInteractionSuite<Group>(input: {
  groups: readonly Group[];
  execute: (group: Group, index: number) => Promise<void>;
  restoreBaseline: (group: Group, index: number) => Promise<void>;
}) {
  for (let index = 0; index < input.groups.length; index += 1) {
    const group = input.groups[index]!;
    let executionError: unknown;
    try {
      await input.execute(group, index);
    } catch (error) {
      executionError = error;
    }

    try {
      await input.restoreBaseline(group, index);
    } catch (restoreError) {
      if (executionError !== undefined) {
        throw new AggregateError(
          [executionError, restoreError],
          `Interaction suite group ${String(group)} failed and its baseline could not be restored.`
        );
      }
      throw restoreError;
    }

    if (executionError !== undefined) throw executionError;
  }
}

export function formatInteractionError(error: unknown): string {
  const format = (value: unknown, depth: number): string => {
    const message = value instanceof Error
      ? value.stack || value.message
      : String(value);
    if (!(value instanceof AggregateError)) return message;

    return [
      message,
      ...Array.from(value.errors, (cause, index) => (
        `${"  ".repeat(depth + 1)}cause ${index + 1}: ${format(cause, depth + 1)}`
      ))
    ].join("\n");
  };

  return format(error, 0);
}
