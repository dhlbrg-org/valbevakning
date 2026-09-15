import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RegionResult, PollResponse, PollSummary, Candidate } from '$lib/types';
import AdmZip from 'adm-zip';

// Standard 20 Swedish region codes and names
const REGION_CODES: { code: string; name: string }[] = [
  { code: '01', name: 'Stockholm' },
  { code: '03', name: 'Uppsala' },
  { code: '04', name: 'Södermanland' },
  { code: '05', name: 'Östergötland' },
  { code: '06', name: 'Jönköping' },
  { code: '07', name: 'Kronoberg' },
  { code: '08', name: 'Kalmar' },
  { code: '10', name: 'Blekinge' },
  { code: '12', name: 'Skåne' },
  { code: '13', name: 'Halland' },
  { code: '14', name: 'Västra Götaland' },
  { code: '17', name: 'Värmland' },
  { code: '18', name: 'Örebro' },
  { code: '19', name: 'Västmanland' },
  { code: '20', name: 'Dalarna' },
  { code: '21', name: 'Gävleborg' },
  { code: '22', name: 'Västernorrland' },
  { code: '23', name: 'Jämtland' },
  { code: '24', name: 'Västerbotten' },
  { code: '25', name: 'Norrbotten' }
];

let mpRegisteredRegionsCache: { timestamp: number; candidates: Map<string, Candidate[]> } | null = null;

async function getMpRegisteredRegions(): Promise<Map<string, Candidate[]>> {
  const now = Date.now();
  if (mpRegisteredRegionsCache && (now - mpRegisteredRegionsCache.timestamp) < 3600 * 1000) {
    return mpRegisteredRegionsCache.candidates;
  }

  const tempMap = new Map<string, Candidate[]>();
  const candidatesMap = new Map<string, Candidate[]>();

  const years = ['2026', '2022'];
  for (const year of years) {
    try {
      const url = `https://data.val.se/filer/val${year}/parti/kandidaturer.csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split(/\r?\n/);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(';');
          if ((cols[0] === 'RF' || cols[0] === 'JRF') && (cols[5] === 'Miljöpartiet de gröna' || cols[6] === 'MP' || cols[7] === '0055')) {
            const rCode = cols[1]?.slice(0, 2);
            if (rCode) {
              const order = parseInt(cols[11], 10) || 999;
              const name = cols[16];
              const age = cols[17];
              const info = cols[20];
              if (name) {
                if (!tempMap.has(rCode)) tempMap.set(rCode, []);
                tempMap.get(rCode)!.push({ order, name, age, info });
              }
            }
          }
        }
        if (tempMap.size > 0) break;
      }
    } catch (e) {}
  }

  for (const [rCode, candList] of tempMap.entries()) {
    candList.sort((a, b) => a.order - b.order);
    const seenNames = new Set<string>();
    const unique: Candidate[] = [];
    for (const c of candList) {
      if (!seenNames.has(c.name)) {
        seenNames.add(c.name);
        unique.push(c);
      }
    }
    candidatesMap.set(rCode, unique.slice(0, 25));
  }

  mpRegisteredRegionsCache = { timestamp: now, candidates: candidatesMap };
  return candidatesMap;
}

let activeRegionYearCache: { year: string; timestamp: number } | null = null;

async function detectActiveRegionYear(phase: 'preliminary' | 'final'): Promise<string> {
  const now = Date.now();
  if (activeRegionYearCache && (now - activeRegionYearCache.timestamp) < 600 * 1000) {
    return activeRegionYearCache.year;
  }
  const filePrefix = phase === 'final' ? 'slutlig' : 'preliminar';
  try {
    const res = await fetch(`https://resultat.val.se/resultatfiler/val2026/p/rf/Val_2026_${filePrefix}_01_RF.zip`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      activeRegionYearCache = { year: '2026', timestamp: now };
      return '2026';
    }
  } catch (e) {
    // 2026 not ready
  }
  activeRegionYearCache = { year: '2022', timestamp: now };
  return '2022';
}

async function fetchLiveRegionData(code: string, phase: 'preliminary' | 'final', targetYear: string, rfCandidatesMap: Map<string, Candidate[]>): Promise<{ result: RegionResult; year: string } | null> {
  const filePrefix = phase === 'final' ? 'slutlig' : 'preliminar';
  
  // Try 2026 live zip first, fallback to 2022 live zip from val.se if 2026 is not published yet
  const yearsToTry = targetYear === '2026' ? ['2026', '2022'] : ['2022'];
  let response: Response | null = null;
  let usedYear = targetYear;

  for (const year of yearsToTry) {
    const url = `https://resultat.val.se/resultatfiler/val${year}/p/rf/Val_${year}_${filePrefix}_${code}_RF.zip`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        response = res;
        usedYear = year;
        break;
      }
    } catch (e) {
      // Ignore network errors during fallback attempt
    }
  }

  if (!response || !response.ok) {
    throw new Error(`Kunde inte hämta live-resultatfil från val.se för region ${code} (${phase})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const zip = new AdmZip(Buffer.from(arrayBuffer));
  
  const mandatFilename = `Val_${usedYear}_${filePrefix}_mandatfordelning_${code}_RF.json`;
  const zipEntry = zip.getEntry(mandatFilename);
  
  if (!zipEntry) {
    throw new Error(`Hittade inte ${mandatFilename} i zip-filen från val.se`);
  }

  const jsonText = zipEntry.getData().toString('utf8');
  const data = JSON.parse(jsonText);
  const vo = data.valomrade || {};

  let mpMandates = 0;
  let mpMandatesChange = 0;
  let mpVotesPct = 0;
  let mpVotesPctChange = 0;
  let mpVotesCount = 0;
  let mpVotesCountChange = 0;

  const partyMandates: { code: string; name: string; mandates: number; mandatesChange?: number }[] = [];

  for (const p of vo.mandatfordelning?.partiLista || []) {
    const mandates = p.antalMandat || 0;
    const pCode = p.partiforkortning || p.partikod || 'ÖVR';
    const pName = p.partinamn || pCode;
    const mandatesChange = p.forandringAntalMandat ?? p.forandringMandat ?? 0;

    if (p.partiforkortning === 'MP' || p.partikod === '0055') {
      mpMandates = mandates;
      mpMandatesChange = mandatesChange;
    }

    if (mandates > 0) {
      partyMandates.push({
        code: pCode,
        name: pName,
        mandates,
        mandatesChange
      });
    }
  }

  // Sort partyMandates descending by number of mandates won
  partyMandates.sort((a, b) => b.mandates - a.mandates);

  const allPartyVotes: { code: string; votes: number }[] = [];
  if (vo.rostfordelning?.rosterPaverkaMandat?.partiRoster) {
    for (const pr of vo.rostfordelning.rosterPaverkaMandat.partiRoster) {
      const pCode = pr.partiforkortning || pr.partikod || 'ÖVR';
      const votes = pr.antalRoster || 0;
      allPartyVotes.push({ code: pCode, votes });

      if (pr.partiforkortning === 'MP' || pr.partikod === '0055') {
        mpVotesPct = pr.andelRoster !== undefined ? Number(pr.andelRoster) : 0;
        mpVotesPctChange = pr.forandringAndelRoster !== undefined ? Number(pr.forandringAndelRoster) : 0;
        mpVotesCount = pr.antalRoster || 0;
        mpVotesCountChange = pr.forandringAntalRoster ?? 0;
      }
    }
  }

  let totalValidVotes = vo.totaltAntalRoster || 0;
  if (!totalValidVotes && vo.rostfordelning?.rosterPaverkaMandat?.partiRoster) {
    totalValidVotes = vo.rostfordelning.rosterPaverkaMandat.partiRoster.reduce(
      (sum: number, p: any) => sum + (p.antalRoster || 0),
      0
    );
  }
  if (!totalValidVotes && mpVotesCount > 0 && mpVotesPct > 0) {
    totalValidVotes = Math.round((mpVotesCount / mpVotesPct) * 100);
  }

  const thresholdVotesCount = Math.ceil(totalValidVotes * 0.03);
  const votesDiffFromThreshold = mpVotesCount - thresholdVotesCount;

  // Strict 3% threshold rule for mandates: < 3% => 0 mandates
  const isOverThreshold = mpVotesPct >= 3.0 && votesDiffFromThreshold >= 0;
  if (!isOverThreshold) {
    mpMandates = 0;
  }

  // Calculate Sainte-Laguë quotients across all parties
  interface QuotientItem {
    code: string;
    quotient: number;
  }

  const regionTotalMandates = vo.totaltAntalMandat || 71;
  const maxMandatesToTest = Math.max(100, regionTotalMandates + 10);
  const quotients: QuotientItem[] = [];
  for (const pv of allPartyVotes) {
    for (let k = 1; k <= maxMandatesToTest; k++) {
      const divisor = k === 1 ? 1.2 : (2 * (k - 1) + 1);
      quotients.push({ code: pv.code, quotient: pv.votes / divisor });
    }
  }
  quotients.sort((a, b) => b.quotient - a.quotient);

  const winnerQuotients = quotients.slice(0, regionTotalMandates);
  const loserQuotients = quotients.slice(regionTotalMandates);

  const otherWinners = winnerQuotients.filter((q) => q.code !== 'MP');
  const otherLosers = loserQuotients.filter((q) => q.code !== 'MP');

  const targetWinnerQ = otherWinners[otherWinners.length - 1]?.quotient || winnerQuotients[winnerQuotients.length - 1]?.quotient || 0;

  // Votes needed for MP's NEXT mandate
  const mpCurrentCount = mpMandates;
  const mpNextIndex = mpCurrentCount + 1;
  const mpNextDivisor = mpNextIndex === 1 ? 1.2 : (2 * (mpNextIndex - 1) + 1);

  let votesToNextMandate = Math.max(1, Math.ceil(targetWinnerQ * mpNextDivisor - mpVotesCount));
  if (mpCurrentCount === 0) {
    const votesToSparr = Math.max(0, thresholdVotesCount - mpVotesCount);
    votesToNextMandate = Math.max(votesToNextMandate, votesToSparr);
  }

  // Votes MP can lose before LOSING sista mandatet
  let votesToLoseMandate = 0;
  if (mpCurrentCount >= 1) {
    const mpLastDivisor = mpCurrentCount === 1 ? 1.2 : (2 * (mpCurrentCount - 1) + 1);
    const runnerUpQ = otherLosers[0]?.quotient || loserQuotients[0]?.quotient || 0;

    const voteDropToLoseQuotient = Math.max(1, Math.floor(mpVotesCount - runnerUpQ * mpLastDivisor));
    const voteDropToLoseSparr = Math.max(1, mpVotesCount - thresholdVotesCount);

    votesToLoseMandate = Math.min(voteDropToLoseQuotient, voteDropToLoseSparr);
  }

  const hasMandate = mpMandates > 0 && isOverThreshold;
  const previousMandates = mpMandates - mpMandatesChange;
  const isNewRegionWithMandate = hasMandate && previousMandates <= 0;

  const districtsCounted = vo.antalValdistriktRaknade || 0;
  const districtsTotal = vo.antalValdistriktSomSkaRaknas || 0;
  const candidates = rfCandidatesMap.get(code) || [];

  return {
    year: usedYear,
    result: {
      code,
      name: vo.namn || REGION_CODES.find((r) => r.code === code)?.name || code,
      mpMandates,
      mpMandatesChange,
      mpVotesPct,
      mpVotesPctChange,
      mpVotesCount,
      mpVotesCountChange,
      totalValidVotes,
      thresholdVotesCount,
      votesDiffFromThreshold,
      totalMandates: regionTotalMandates,
      districtsCounted,
      districtsTotal,
      hasMandate,
      isCountingComplete: districtsTotal > 0 && districtsCounted === districtsTotal,
      isNewRegionWithMandate,
      partyMandates,
      votesToNextMandate,
      votesToLoseMandate,
      hasRegisteredMpList: true,
      candidates
    }
  };
}

function buildSummary(regions: RegionResult[]): PollSummary {
  const belowThreshold = regions.filter((r) => r.mpVotesPct < 3.0);
  return {
    totalMpMandates: regions.reduce((sum, r) => sum + r.mpMandates, 0),
    totalMpMandatesChange: regions.reduce((sum, r) => sum + r.mpMandatesChange, 0),
    totalMpVotes: regions.reduce((sum, r) => sum + r.mpVotesCount, 0),
    totalMpVotesChange: regions.reduce((sum, r) => sum + r.mpVotesCountChange, 0),
    regionsWithMandatesCount: regions.filter((r) => r.hasMandate).length,
    newlyGainedRegionsCount: regions.filter((r) => r.isNewRegionWithMandate).length,
    regionsBelowThresholdCount: belowThreshold.length,
    totalVotesNeededBelowThreshold: belowThreshold.reduce(
      (sum, r) => sum + Math.abs(r.votesDiffFromThreshold),
      0
    ),
    totalRegions: regions.length,
    totalDistrictsCounted: regions.reduce((sum, r) => sum + r.districtsCounted, 0),
    totalDistrictsTotal: regions.reduce((sum, r) => sum + r.districtsTotal, 0),
    averageMpVotePct: Number(
      (regions.reduce((sum, r) => sum + r.mpVotesPct, 0) / (regions.length || 1)).toFixed(1)
    ),
    averageMpVotePctChange: Number(
      (regions.reduce((sum, r) => sum + r.mpVotesPctChange, 0) / (regions.length || 1)).toFixed(1)
    )
  };
}

// In-memory cache (60 seconds TTL) to protect Valmyndigheten & optimize high-concurrency traffic
const CACHE_TTL_MS = 60 * 1000;
const memoryCache_v4: Record<string, { timestamp: number; data: PollResponse }> = {};

export const GET: RequestHandler = async ({ url }) => {
  const phase = (url.searchParams.get('phase') || 'preliminary') as 'preliminary' | 'final';
  const now = Date.now();

  // Return cached result if fresh (< 60s)
  if (memoryCache_v4[phase] && (now - memoryCache_v4[phase].timestamp) < CACHE_TTL_MS) {
    return json(memoryCache_v4[phase].data, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30'
      }
    });
  }

  const timestamp = new Date(now).toISOString();

  try {
    const rfCandidatesMap = await getMpRegisteredRegions();
    const activeYear = await detectActiveRegionYear(phase);
    const regionPromises = REGION_CODES.map((meta) => fetchLiveRegionData(meta.code, phase, activeYear, rfCandidatesMap));
    const liveResults = await Promise.all(regionPromises);
    const validFetched = liveResults.filter((r): r is { result: RegionResult; year: string } => r !== null);
    
    if (validFetched.length === 0) {
      throw new Error('Inga resultatfiler kunde hämtas från val.se');
    }

    const validRegions = validFetched.map((f) => f.result);
    const usedYear = validFetched[0]?.year || '2026';
    const phaseLabel = phase === 'final' ? 'Slutgiltig rösträkning (Länsstyrelsen)' : 'Preliminär rösträkning (Valmyndigheten val.se)';
    const summary = buildSummary(validRegions);

    const response: PollResponse = {
      timestamp,
      source: 'live',
      status: 'success',
      electionYear: usedYear,
      countingPhase: `${phaseLabel} – Val ${usedYear}`,
      summary,
      regions: validRegions
    };

    memoryCache_v4[phase] = { timestamp: now, data: response };

    return json(response, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30'
      }
    });
  } catch (err: any) {
    console.warn(`Live poll (${phase}) from val.se failed:`, err?.message || err);

    // If fetch fails, serve stale cache if available
    if (memoryCache_v4[phase]) {
      return json(memoryCache_v4[phase].data, {
        headers: {
          'Cache-Control': 'public, max-age=10, s-maxage=10'
        }
      });
    }

    const phaseLabel = phase === 'final' ? 'Slutgiltig rösträkning' : 'Preliminär rösträkning';
    const response: PollResponse = {
      timestamp,
      source: 'live',
      status: 'error',
      electionYear: '2026',
      countingPhase: `Anslutningsfel (${phaseLabel})`,
      summary: {
        totalMpMandates: 0,
        totalMpMandatesChange: 0,
        totalMpVotes: 0,
        totalMpVotesChange: 0,
        regionsWithMandatesCount: 0,
        newlyGainedRegionsCount: 0,
        regionsBelowThresholdCount: 0,
        totalVotesNeededBelowThreshold: 0,
        totalRegions: 0,
        totalDistrictsCounted: 0,
        totalDistrictsTotal: 0,
        averageMpVotePct: 0,
        averageMpVotePctChange: 0
      },
      regions: [],
      errorDetails: err?.message || 'Nätverksfel eller Timeout vid anrop till val.se'
    };

    return json(response, { status: 504 });
  }
};
