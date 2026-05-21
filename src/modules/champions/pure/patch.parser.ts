export interface PatchInfo {
  patch: string;
  fullVersion: string;
}

export function parsePatches(versions: string[]): PatchInfo[] {
  return versions.map((fullVersion) => {
    const patchParts = fullVersion.split('.');
    const patch =
      patchParts.length >= 2
        ? `${patchParts[0]}.${patchParts[1]}`
        : fullVersion;

    return { patch, fullVersion };
  });
}
