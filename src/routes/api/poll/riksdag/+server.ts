import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RiksdagPollResponse, RiksdagResult, RiksdagDiff, MatchedDiff, PollSummary, PartyMandate, Candidate, CandidateList } from '$lib/types';
import { simulateElectedCandidates, type ValkretsCandidatesMap } from '$lib/server/candidates';

interface ValkretsCandidatesData {
  candidateLists: CandidateList[];
  primaryCandidates: Candidate[];
}

let mpRegisteredRdCache: { timestamp: number; candidates: Map<string, ValkretsCandidatesData> } | null = null;

async function getMpRegisteredRiksdag(): Promise<Map<string, ValkretsCandidatesData>> {
  const now = Date.now();
  if (mpRegisteredRdCache && (now - mpRegisteredRdCache.timestamp) < 3600 * 1000) {
    return mpRegisteredRdCache.candidates;
  }

  const rawMap = new Map<string, { vkName: string; lists: Map<string, CandidateList> }>();

  const years = ['2026', '2022'];
  for (const year of years) {
    try {
      const url = `https://data.val.se/filer/val${year}/parti/kandidaturer.csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split(/\r\n|\n|\r/);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(';');
          if (cols[0] && cols[0].endsWith('RD') && (cols[5] === 'Miljöpartiet de gröna' || cols[6] === 'MP' || cols[7] === '0055')) {
            const vkCode = (cols[3] || '').padStart(2, '0');
            const vkName = cols[4] || '';
            const listNumber = cols[9] || 'default';
            const listName = cols[10] || vkName || 'Valsedel';
            const order = parseInt(cols[11], 10) || 999;
            const name = cols[16];
            const age = cols[17];
            const info = cols[20];
            if (name && vkCode) {
              if (!rawMap.has(vkCode)) rawMap.set(vkCode, { vkName, lists: new Map() });
              const vkEntry = rawMap.get(vkCode)!;
              if (!vkEntry.lists.has(listNumber)) {
                vkEntry.lists.set(listNumber, { listNumber, listName, candidates: [] });
              }
              vkEntry.lists.get(listNumber)!.candidates.push({ order, name, age, info });
            }
          }
        }
        if (rawMap.size > 0) break;
      }
    } catch (e) {}
  }

  const candidatesMap = new Map<string, ValkretsCandidatesData>();

  rawMap.forEach((vkEntry, vkCode) => {
    const allLists = Array.from(vkEntry.lists.values());

    allLists.forEach(l => l.candidates.sort((a, b) => a.order - b.order));

    const filtered = allLists.filter(l => {
      const isLocal = l.listName.toLowerCase().includes(vkEntry.vkName.toLowerCase()) || 
                      vkEntry.vkName.toLowerCase().includes(l.listName.toLowerCase());
      const isNational = l.listName.toUpperCase() === 'HELA LANDET';
      return isLocal || isNational || l.candidates.length >= 3;
    }).map(l => ({
      ...l,
      isLocal: l.listName.toLowerCase().includes(vkEntry.vkName.toLowerCase()) || 
               vkEntry.vkName.toLowerCase().includes(l.listName.toLowerCase())
    }));

    filtered.sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      const aNat = a.listName.toUpperCase() === 'HELA LANDET';
      const bNat = b.listName.toUpperCase() === 'HELA LANDET';
      if (aNat && !bNat) return -1;
      if (!aNat && bNat) return 1;
      return b.candidates.length - a.candidates.length;
    });

    candidatesMap.set(vkCode, {
      candidateLists: filtered,
      primaryCandidates: filtered[0]?.candidates || []
    });
  });

  mpRegisteredRdCache = { timestamp: now, candidates: candidatesMap };
  return candidatesMap;
}

const CACHE_TTL_MS = 10 * 1000;
const memoryCache: { timestamp: number; data: RiksdagPollResponse } | null = null;
let memoryCacheData: { timestamp: number; data: RiksdagPollResponse } | null = null;

export const GET: RequestHandler = async () => {
  const now = Date.now();

  if (memoryCacheData && (now - memoryCacheData.timestamp) < CACHE_TTL_MS) {
    return json(memoryCacheData.data, {
      headers: {
        'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=5'
      }
    });
  }

  try {
    const rdCandidatesMap = await getMpRegisteredRiksdag();
    const years = ['2026', '2022'];
    let slutligData: any = null;
    let prelimData: any = null;
    let usedYear = '2026';

    for (const year of years) {
      try {
        const [resS, resP] = await Promise.all([
          fetch(`https://resultat.val.se/data/resultat/val${year}/RD_S.json`, { signal: AbortSignal.timeout(4000) }),
          fetch(`https://resultat.val.se/data/resultat/val${year}/RD_P.json`, { signal: AbortSignal.timeout(4000) })
        ]);
        if (resS.ok && resP.ok) {
          const sData = await resS.json();
          const pData = await resP.json();
          if (sData.antalValdistriktRaknade > 0 || year === '2022') {
            slutligData = sData;
            prelimData = pData;
            usedYear = year;
            break;
          }
        }
      } catch (e) {}
    }

    if (!slutligData || !prelimData) {
      if (memoryCacheData) {
        return json(
          {
            ...memoryCacheData.data,
            source: 'cache',
            countingPhase: `${memoryCacheData.data.countingPhase} (Cachad data - val.se tillfälligt ej nåbar)`
          },
          {
            headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' }
          }
        );
      }
      return json(
        {
          timestamp: new Date().toISOString(),
          source: 'live',
          status: 'error',
          electionYear: '2026',
          countingPhase: 'Riksdagsval',
          errorDetails: 'Valmyndigheten (val.se) svarade inte eller begränsade anrop (HTTP 429/Timeout). Appen försöker igen automatisk.'
        },
        { status: 504 }
      );
    }

    const getMpPartiRoster = (data: any) => (data.rosterPaverkaMandat?.partiroster || []).find((p: any) => p.partiforkortning === 'MP');
    const getMpMandatInfo = (data: any) => (data.partiMandat || []).find((p: any) => p.partiforkortning === 'MP');

    const mpS = getMpPartiRoster(slutligData);
    const mpP = getMpPartiRoster(prelimData);
    const rawMpMandatS = getMpMandatInfo(slutligData)?.antalMandat || 0;
    const mpMandatP = getMpMandatInfo(prelimData)?.antalMandat || 0;

    const mpVotesS = mpS?.antalRoster || 0;
    const mpVotesP = mpP?.antalRoster || 0;
    const mpVotesPctS = mpS?.andelRoster || 0;
    const mpVotesPctP = mpP?.andelRoster || 0;

    const totalValidVotesS = slutligData.rosterPaverkaMandat?.antalRoster || 1;
    const threshold4PctVotes = Math.ceil(totalValidVotesS * 0.04);
    const votesDiffFromThreshold = mpVotesS - threshold4PctVotes;

    // Estimate projected mandates if final mandates are not yet finalized in partial count
    const effectiveMpMandatS = (rawMpMandatS === 0 && mpVotesPctS >= 4.0) 
      ? Math.round(349 * (mpVotesPctS / 100))
      : rawMpMandatS;

    const PREVIOUS_MP_MANDATES_2022 = 18;
    const mpMandatesChange2022 = effectiveMpMandatS - PREVIOUS_MP_MANDATES_2022;

    const partyMandates: PartyMandate[] = (slutligData.partiMandat || []).map((p: any) => ({
      code: p.partiforkortning || p.partibeteckning || 'ÖVR',
      name: p.partibeteckning || p.partiforkortning || 'ÖVR',
      mandates: p.antalMandat || 0,
      mandatesChange: p.forandringAntalMandat ?? 0
    })).sort((a: PartyMandate, b: PartyMandate) => b.mandates - a.mandates);

const VALKRETS_DISTRICT_TOTALS: Record<string, number> = {
  '01': 624, '02': 698, '03': 239, '04': 184, '05': 289,
  '06': 231, '07': 125, '08': 169, '09': 39,  '10': 104,
  '11': 201, '12': 204, '13': 198, '14': 202, '15': 211,
  '16': 357, '17': 140, '18': 247, '19': 182, '20': 183,
  '21': 192, '22': 174, '23': 198, '24': 196, '25': 179,
  '26': 105, '27': 194, '28': 175, '29': 1
};

    const nationalDistrictsCounted = slutligData.antalValdistriktRaknade || 0;
    const nationalDistrictsTotal = slutligData.antalValdistriktSomSkaRaknas || 6626;

    const isFullNationalCount = nationalDistrictsCounted >= nationalDistrictsTotal && nationalDistrictsTotal > 0;
    const matchedPrelimVotes = isFullNationalCount
      ? mpVotesP
      : Math.round(totalValidVotesS * (mpVotesPctP / 100));

    const diffVsPrevious: MatchedDiff = {
      finalVotes: mpVotesS,
      finalVotesPct: mpVotesPctS,
      comparisonVotes: mpVotesS - (mpS?.forandringAntalRoster || 0),
      comparisonVotesPct: Number((mpVotesPctS - (mpS?.forandringAndelRoster || 0)).toFixed(2)),
      votesDiff: mpS?.forandringAntalRoster || 0,
      votesPctDiff: mpS?.forandringAndelRoster || 0,
      districtsCounted: nationalDistrictsCounted,
      districtsTotal: nationalDistrictsTotal
    };

    const diffVsPreliminary: RiksdagDiff = {
      votesDiff: mpVotesS - matchedPrelimVotes,
      votesPctDiff: Number((mpVotesPctS - mpVotesPctP).toFixed(2)),
      mandatesDiff: effectiveMpMandatS - mpMandatP,
      preliminaryVotes: matchedPrelimVotes,
      preliminaryVotesPct: mpVotesPctP,
      preliminaryMandates: mpMandatP,
      finalVotes: mpVotesS,
      finalVotesPct: mpVotesPctS,
      finalMandates: effectiveMpMandatS,
      comparisonVotes: matchedPrelimVotes,
      comparisonVotesPct: mpVotesPctP,
      districtsCounted: nationalDistrictsCounted,
      districtsTotal: nationalDistrictsTotal
    };

    const nationalResult: RiksdagResult = {
      code: '00',
      name: 'Riksdagsvalet Hela Riket',
      mpMandates: effectiveMpMandatS,
      mpMandatesChange: mpMandatesChange2022,
      mpVotesPct: mpVotesPctS,
      mpVotesPctChange: mpS?.forandringAndelRoster || 0,
      mpVotesCount: mpVotesS,
      mpVotesCountChange: mpS?.forandringAntalRoster || 0,
      totalValidVotes: totalValidVotesS,
      thresholdVotesCount: threshold4PctVotes,
      thresholdPct: 4.0,
      votesDiffFromThreshold,
      totalMandates: 349,
      districtsCounted: nationalDistrictsCounted,
      districtsTotal: nationalDistrictsTotal,
      hasMandate: effectiveMpMandatS > 0 && mpVotesPctS >= 4.0,
      isCountingComplete: nationalDistrictsCounted >= nationalDistrictsTotal,
      isNewRegionWithMandate: false,
      partyMandates,
      votesToNextMandate: 0,
      votesToLoseMandate: 0,
      hasRegisteredMpList: true,
      diffVsPreliminary,
      diffVsPrevious
    };

    // Process all 29 valkretsar using original array index to preserve exact valkrets codes
    const rawValkretsar = slutligData.valkretsar || [];
    const allValkretsResults: RiksdagResult[] = rawValkretsar.map((vk: any, origIdx: number) => {
      const vkCode = (origIdx + 1).toString().padStart(2, '0');
      const vkMpVotes = (vk.rosterPaverkaMandat?.partiroster || []).find((p: any) => p.partiforkortning === 'MP');
      const vkMpVotesP = (prelimData.valkretsar?.[origIdx]?.rosterPaverkaMandat?.partiroster || []).find((p: any) => p.partiforkortning === 'MP');

      const vkVotesCount = vkMpVotes?.antalRoster || 0;
      const vkVotesPct = vkMpVotes?.andelRoster || 0;
      const vkVotesP = vkMpVotesP?.antalRoster || 0;
      const vkVotesPctP = vkMpVotesP?.andelRoster || 0;

      const vkDistrictsTotal = vk.antalValdistriktSomSkaRaknas || VALKRETS_DISTRICT_TOTALS[vkCode] || 100;
      let vkDistrictsCounted = vk.antalValdistriktRaknade || 0;

      if (vkDistrictsCounted === 0 && (vk.rosterPaverkaMandat?.antalRoster || 0) > 0) {
        if (nationalDistrictsCounted >= nationalDistrictsTotal) {
          vkDistrictsCounted = vkDistrictsTotal;
        } else {
          vkDistrictsCounted = Math.min(vkDistrictsTotal, Math.max(1, Math.round(vkDistrictsTotal * (nationalDistrictsCounted / nationalDistrictsTotal))));
        }
      }

      const vkCandidatesData = rdCandidatesMap.get(vkCode);
      const primaryCandidates = vkCandidatesData?.primaryCandidates || [];
      const candidateLists = vkCandidatesData?.candidateLists || [];
      const simulatedCands = primaryCandidates.slice(0, 15);

      const vkTotalValidVotes = vk.rosterPaverkaMandat?.antalRoster || 1;
      const isFullVkCount = vkDistrictsCounted >= vkDistrictsTotal && vkDistrictsTotal > 0;
      const vkMatchedPrelimVotes = isFullVkCount
        ? vkVotesP
        : Math.round(vkTotalValidVotes * (vkVotesPctP / 100));

      const vkDiff: RiksdagDiff = {
        votesDiff: vkVotesCount - vkMatchedPrelimVotes,
        votesPctDiff: Number((vkVotesPct - vkVotesPctP).toFixed(2)),
        mandatesDiff: 0,
        preliminaryVotes: vkMatchedPrelimVotes,
        preliminaryVotesPct: vkVotesPctP,
        preliminaryMandates: 0,
        finalVotes: vkVotesCount,
        finalVotesPct: vkVotesPct,
        finalMandates: 0,
        comparisonVotes: vkMatchedPrelimVotes,
        comparisonVotesPct: vkVotesPctP,
        districtsCounted: vkDistrictsCounted,
        districtsTotal: vkDistrictsTotal
      };

      const vkDiffVsPrevious: MatchedDiff = {
        finalVotes: vkVotesCount,
        finalVotesPct: vkVotesPct,
        comparisonVotes: vkVotesCount - (vkMpVotes?.forandringAntalRoster || 0),
        comparisonVotesPct: Number((vkVotesPct - (vkMpVotes?.forandringAndelRoster || 0)).toFixed(2)),
        votesDiff: vkMpVotes?.forandringAntalRoster || 0,
        votesPctDiff: vkMpVotes?.forandringAndelRoster || 0,
        districtsCounted: vkDistrictsCounted,
        districtsTotal: vkDistrictsTotal
      };

      return {
        code: vkCode,
        name: vk.namn || `Valkrets ${vkCode}`,
        mpMandates: 0,
        mpMandatesChange: 0,
        mpVotesPct: vkVotesPct,
        mpVotesPctChange: vkMpVotes?.forandringAndelRoster || 0,
        mpVotesCount: vkVotesCount,
        mpVotesCountChange: vkMpVotes?.forandringAntalRoster || 0,
        totalValidVotes: vk.rosterPaverkaMandat?.antalRoster || 1,
        thresholdVotesCount: Math.ceil((vk.rosterPaverkaMandat?.antalRoster || 1) * 0.04),
        thresholdPct: 4.0,
        votesDiffFromThreshold: vkVotesCount - Math.ceil((vk.rosterPaverkaMandat?.antalRoster || 1) * 0.04),
        totalMandates: 0,
        districtsCounted: vkDistrictsCounted,
        districtsTotal: vkDistrictsTotal,
        hasMandate: vkVotesPct >= 4.0,
        isCountingComplete: vkDistrictsCounted > 0 && vkDistrictsCounted >= vkDistrictsTotal,
        isNewRegionWithMandate: false,
        partyMandates: [],
        votesToNextMandate: 0,
        votesToLoseMandate: 0,
        hasRegisteredMpList: true,
        candidates: simulatedCands,
        candidateLists: candidateLists.length > 0 ? candidateLists : undefined,
        diffVsPreliminary: vkDiff,
        diffVsPrevious: vkDiffVsPrevious
      };
    });

    // Filter to ONLY include valkretsar that have actually started counting (districts > 0 or votes > 0)
    const valkretsResults = allValkretsResults.filter((vk) => 
      vk.districtsCounted > 0 || vk.mpVotesCount > 0
    );

    const summary: PollSummary = {
      totalMpMandates: effectiveMpMandatS,
      totalMpMandatesChange: getMpMandatInfo(slutligData)?.forandringAntalMandat || 0,
      totalMpVotes: mpVotesS,
      totalMpVotesChange: mpS?.forandringAntalRoster || 0,
      regionsWithMandatesCount: valkretsResults.filter(v => v.hasMandate).length,
      newlyGainedRegionsCount: 0,
      regionsBelowThresholdCount: valkretsResults.filter(v => v.mpVotesPct < 4.0).length,
      totalVotesNeededBelowThreshold: 0,
      totalRegions: valkretsResults.length,
      totalDistrictsCounted: slutligData.antalValdistriktRaknade || 0,
      totalDistrictsTotal: slutligData.antalValdistriktSomSkaRaknas || 0,
      averageMpVotePct: mpVotesPctS,
      averageMpVotePctChange: mpS?.forandringAndelRoster || 0
    };

    const response: RiksdagPollResponse = {
      timestamp: new Date().toISOString(),
      source: 'live',
      status: 'success',
      electionYear: usedYear,
      countingPhase: `Slutgiltig räkning (Länsstyrelsen) – Val ${usedYear}`,
      summary,
      nationalResult,
      valkretsar: valkretsResults,
      diffVsPreliminary,
      diffVsPrevious
    };

    memoryCacheData = { timestamp: now, data: response };

    return json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60'
      }
    });
  } catch (err: any) {
    if (memoryCacheData) {
      return json(memoryCacheData.data, {
        headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' }
      });
    }
    return json(
      {
        timestamp: new Date().toISOString(),
        source: 'live',
        status: 'error',
        electionYear: '2026',
        countingPhase: 'Riksdagsval',
        errorDetails: err?.message || 'Internt fel vid hämtning av Riksdagsresultat'
      },
      { status: 500 }
    );
  }
};
