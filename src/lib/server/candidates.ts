import type { Candidate } from '$lib/types';

export type ValkretsCandidatesMap = Map<string, { name: string; candidates: Candidate[] }>;

export function simulateElectedCandidates(
  vkMap: ValkretsCandidatesMap | undefined, 
  totalMandates: number,
  minSubstitutes: number = 2
): Candidate[] {
  if (!vkMap || vkMap.size === 0) return [];

  const vkEntries = Array.from(vkMap.entries());

  if (totalMandates <= 0) {
    const allCands: Candidate[] = [];
    const seen = new Set<string>();
    for (const [, vkData] of vkEntries) {
      for (const cand of vkData.candidates) {
        if (!seen.has(cand.name)) {
          seen.add(cand.name);
          allCands.push(cand);
        }
      }
    }
    return allCands.slice(0, 15);
  }

  if (vkEntries.length === 1) {
    const list = vkEntries[0][1].candidates;
    const electedCount = Math.min(totalMandates, list.length);
    const subCount = minSubstitutes === 3 
      ? Math.max(3, totalMandates)
      : Math.max(minSubstitutes, Math.ceil(totalMandates / 2));

    const elected = list.slice(0, electedCount).map(c => ({
      ...c,
      role: 'Ordinarie' as const
    }));
    const sub = list.slice(electedCount, electedCount + subCount).map(c => ({
      ...c,
      role: 'Ersättare' as const
    }));
    return [...elected, ...sub];
  }

  // Multi-valkrets allocation
  const mandatesPerVk = new Array(vkEntries.length).fill(0);
  for (let i = 0; i < totalMandates; i++) {
    mandatesPerVk[i % vkEntries.length]++;
  }

  const electedNames = new Set<string>();
  const electedResults: Candidate[] = [];
  const subResults: Candidate[] = [];

  // 1. Ordinarie ledamöter
  vkEntries.forEach(([vkCode, vkData], i) => {
    const m = mandatesPerVk[i];
    if (m > 0) {
      let taken = 0;
      for (const cand of vkData.candidates) {
        if (!electedNames.has(cand.name)) {
          electedNames.add(cand.name);
          electedResults.push({
            ...cand,
            role: 'Ordinarie' as const,
            valkrets: vkData.name
          });
          taken++;
          if (taken >= m) break;
        }
      }
    }
  });

  // 2. Ersättare
  vkEntries.forEach(([vkCode, vkData], i) => {
    const m = mandatesPerVk[i];
    if (m > 0) {
      const subCount = minSubstitutes === 3 
        ? Math.max(3, m)
        : Math.max(minSubstitutes, Math.ceil(m / 2));
      let taken = 0;
      for (const cand of vkData.candidates) {
        if (!electedNames.has(cand.name)) {
          electedNames.add(cand.name);
          subResults.push({
            ...cand,
            role: 'Ersättare' as const,
            valkrets: vkData.name
          });
          taken++;
          if (taken >= subCount) break;
        }
      }
    }
  });

  return [...electedResults, ...subResults];
}
