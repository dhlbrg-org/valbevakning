import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { 
  calculateElectedMembersAndSubstitutes, 
  calculateMunicipalSubstituteRule, 
  calculateRegionalSubstituteRule,
  type EngineCandidateInput,
  type ConstituencyInput
} from '$lib/server/electionEngine';
import type { PartyApiResult, ConstituencySeats } from '$lib/types';

export const GET: RequestHandler = async ({ params, fetch }) => {
  const electionId = params.electionId || '0180';
  const partyCode = (params.party || 'MP').toUpperCase();

  let electionType: 'region' | 'kommun' | 'riksdag' = 'kommun';
  if (electionId === '00' || electionId.toUpperCase() === 'RD') {
    electionType = 'riksdag';
  } else if (electionId.length === 2 && electionId !== '09') {
    // 2-digit codes (01..25 except 09) are regioner
    electionType = 'region';
  } else {
    electionType = 'kommun';
  }

  try {
    let rawResult: any = null;
    let candidatesData: Map<string, EngineCandidateInput[]> = new Map();

    if (electionType === 'region') {
      const pollRes = await fetch('/api/poll');
      if (pollRes.ok) {
        const data = await pollRes.json();
        rawResult = (data.regions || []).find((r: any) => r.code === electionId);
      }
    } else if (electionType === 'kommun') {
      const pollRes = await fetch('/api/poll/kommuner');
      if (pollRes.ok) {
        const data = await pollRes.json();
        rawResult = (data.municipalities || []).find((m: any) => m.code === electionId);
      }
    } else {
      const pollRes = await fetch('/api/poll/riksdag');
      if (pollRes.ok) {
        const data = await pollRes.json();
        rawResult = data.nationalResult;
      }
    }

    const partyMandatesCount = rawResult?.mpMandates || rawResult?.partyMandates?.find((p: any) => p.code === partyCode)?.mandates || 0;
    const isCountingComplete = rawResult?.isCountingComplete || false;
    const personVotesAvailable = false; // Initial phase: person votes not yet counted

    // Build constituency inputs
    const cands: EngineCandidateInput[] = (rawResult?.candidates || []).map((c: any, i: number) => ({
      id: `cand_${i + 1}`,
      name: c.name,
      order: c.order || (i + 1),
      personalVotes: c.personalVotes
    }));

    const constituencySeatsList: ConstituencySeats[] = [
      {
        id: electionId,
        name: rawResult?.name || `Valområde ${electionId}`,
        fixed_seats: partyMandatesCount,
        adjustment_seats: 0,
        party_seats: partyMandatesCount
      }
    ];

    const constituencyInputs: ConstituencyInput[] = [
      {
        id: electionId,
        name: rawResult?.name || `Valområde ${electionId}`,
        partySeats: partyMandatesCount,
        totalPartyVotesInConstituency: rawResult?.mpVotesCount || 5000,
        candidates: cands
      }
    ];

    const engineResult = calculateElectedMembersAndSubstitutes({
      electionType,
      constituencies: constituencyInputs,
      personVotesAvailable,
      isCountingComplete,
      municipalityCode: electionType === 'kommun' ? electionId : undefined
    });

    const substituteRule = electionType === 'kommun'
      ? calculateMunicipalSubstituteRule(partyMandatesCount, electionId)
      : calculateRegionalSubstituteRule();

    const uniqueSubstituteNames = new Set(engineResult.substitutes.map(s => s.candidateName));

    const response: PartyApiResult = {
      party: partyCode,
      election_id: electionId,
      election_name: rawResult?.name || electionId,
      election_type: electionType,
      mandates: {
        total: partyMandatesCount,
        by_constituency: constituencySeatsList
      },
      members: {
        status: engineResult.status,
        reason: personVotesAvailable ? 'Slutgiltigt resultat inklusive personröster.' : 'Prognostiserade ledamöter – personröster ännu ej medräknade.',
        person_votes_included: personVotesAvailable,
        items: engineResult.members
      },
      substitutes: {
        status: engineResult.status,
        items: engineResult.substitutes,
        unique_count: uniqueSubstituteNames.size
      },
      substitute_rule: substituteRule,
      provenance: {
        source: 'Valmyndigheten',
        source_url: `https://resultat.val.se/data/resultat/val2026/${electionType === 'region' ? 'RF' : electionType === 'kommun' ? 'KF' : 'RD'}_S.json`,
        retrieved_at: new Date().toISOString(),
        election_year: 2026
      }
    };

    return json(response, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60'
      }
    });
  } catch (err: any) {
    return json(
      {
        error: 'Kunna inte beräkna partibaserat valresultat',
        message: err?.message || String(err)
      },
      { status: 500 }
    );
  }
};
