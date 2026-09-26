/**
 * Converte skillSlot numérico para letra (1=Q, 2=W, 3=E, 4=R)
 */
export function skillSlotToLetter(slot: number): string {
  const map: Record<number, string> = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };
  return map[slot] || '?';
}
