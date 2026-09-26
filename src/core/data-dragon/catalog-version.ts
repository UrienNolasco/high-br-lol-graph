export function gameVersionPatch(
  gameVersion: string | null | undefined,
): string | null {
  const match = /^(\d+)\.(\d+)(?:\.|$)/.exec(gameVersion ?? '');
  return match ? `${Number(match[1])}.${Number(match[2])}` : null;
}

/** Selects the newest Data Dragon revision in the requested major/minor patch. */
export function compatibleItemVersion(
  gameVersion: string,
  versions: readonly string[],
): string | null {
  const patch = gameVersionPatch(gameVersion);
  if (!patch) return null;
  return (
    versions
      .filter(
        (version) =>
          /^\d+\.\d+\.\d+$/.test(version) &&
          version.split('.').slice(0, 2).map(Number).join('.') === patch,
      )
      .sort((a, b) => Number(b.split('.')[2]) - Number(a.split('.')[2]))[0] ??
    null
  );
}
