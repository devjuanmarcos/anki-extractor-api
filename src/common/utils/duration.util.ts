const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

const MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationToMs(value: string): number {
  const match = value.match(DURATION_PATTERN);

  if (!match) {
    throw new Error(`Unsupported duration value: ${value}`);
  }

  const [, amount, unit] = match;
  return Number(amount) * MULTIPLIERS[unit];
}
