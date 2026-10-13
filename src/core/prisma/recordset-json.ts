import { Prisma } from '@prisma/client';

/**
 * Keep createMany's numeric representation while sending wide rows as JSON.
 * Prisma 6's numeric parameter codec can change a float by an ULP, whereas a
 * JSON string bypasses that codec. Bind distinct non-safe-integer numbers once and
 * read them as text (not through the result float decoder) before serialization.
 * No rounding policy or processing-version change is introduced here.
 */
export async function recordsetJson(
  tx: Prisma.TransactionClient,
  rows: readonly object[],
): Promise<string> {
  const numbers = new Set<number>();
  const visit = (value: unknown): void => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw new TypeError('Non-finite recordset number');
      if (!Number.isSafeInteger(value)) numbers.add(value);
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) visit(child);
    }
  };
  visit(rows);
  const originals = [...numbers];
  const replacements = new Map<number, number>();
  if (originals.length) {
    const [result] = await tx.$queryRaw<Array<{ numbers: string }>>(
      Prisma.sql`SELECT array_to_json(${originals}::double precision[])::text AS numbers`,
    );
    const encoded = JSON.parse(result.numbers) as number[];
    if (encoded.length !== originals.length)
      throw new Error('Numeric recordset conversion changed cardinality');
    originals.forEach((number, index) =>
      replacements.set(number, encoded[index]),
    );
  }
  return JSON.stringify(rows, (_, value: unknown) =>
    typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'number'
        ? (replacements.get(value) ?? value)
        : value,
  );
}
