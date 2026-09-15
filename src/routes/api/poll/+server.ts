import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RegionResult, PollResponse, PollSummary } from '$lib/types';
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

async function fetchLiveRegionData(code: string, phase: 'preliminary' | 'final'): Promise<{ result: RegionResult; year: string } | null> {
  const filePrefix = phase === 'final' ? 'slutlig' : 'preliminar';
  
  // Try 2026 live zip first, fallback to 2022 live zip from val.se if 2026 is not published yet
  const yearsToTry = ['2026', '2022'];
  let response: Response | null = null;
  let usedYear = '2026';

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
    const code = p.partiforkortning || p.partikod || 'ÖVR';
    const name = p.partinamn || code;
    const mandatesChange = p.forandringAntalMandat ?? p.forandringMandat ?? 0;

    if (p.partiforkortning === 'MP' || p.partikod === '0055') {
      mpMandates = mandates;
      mpMandatesChange = mandatesChange;
    }

    if (mandates > 0) {
      partyMandates.push({
        code,
        name,
        mandates,
        mandatesChange
      });
    }
  }

  // Sort partyMandates descending by number of mandates won
  partyMandates.sort((a, b) => b.mandates - a.mandates);

  const allPartyVotes: { code: string; votes: number }[] = [];
  for (const p of vo.rostfordelning?.rosterPaverkaMandat?.partiRoster || []) {
    if (p.partiforkortning === 'MP' || p.partikod === '0055') {
      mpVotesPct = p.andelRoster || 0;
      mpVotesPctChange = p.forandringAndelRoster ?? p.forandringAndel ?? 0;
      mpVotesCount = p.antalRoster || 0;
      mpVotesCountChange = p.forandringRoster ?? p.forandringAntalRoster ?? 0;
    }
    const pCode = p.partiforkortning || p.partikod || 'ÖVR';
    const pVotes = p.antalRoster || 0;
    if (pVotes > 0) {
      allPartyVotes.push({ code: pCode, votes: pVotes });
    }
  }

  let totalValidVotes = vo.rostfordelning?.antalGiltigaRoster || 0;
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

  return {
    year: usedYear,
    result: {
      code,
      name: vo.namn || `Region ${code}`,
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
      votesToLoseMandate
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

export const GET: RequestHandler = async ({ url }) => {
  const phase = (url.searchParams.get('phase') || 'preliminary') as 'preliminary' | 'final';
  const timestamp = new Date().toISOString();

  try {
    const regionPromises = REGION_CODES.map((meta) => fetchLiveRegionData(meta.code, phase));
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

    return json(response);
  } catch (err: any) {
    console.warn(`Live poll (${phase}) from val.se failed:`, err?.message || err);

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
