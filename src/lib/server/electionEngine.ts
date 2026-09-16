import type { 
  Candidate, 
  ResultStatus, 
  ElectedMember, 
  SubstituteAssignment, 
  MunicipalSubstituteRule, 
  RegionalSubstituteRule,
  ConstituencySeats,
  PartyApiResult
} from '$lib/types';
import fs from 'fs';
import path from 'path';

export interface EngineCandidateInput {
  id?: string;
  name: string;
  order: number;
  personalVotes?: number;
  valkretsId?: string;
}

export interface ConstituencyInput {
  id: string;
  name: string;
  fixedSeats?: number;
  adjustmentSeats?: number;
  partySeats: number;
  totalPartyVotesInConstituency?: number;
  candidates: EngineCandidateInput[];
}

let municipalRulesCache: Map<string, any> | null = null;
let regionalRulesCache: any | null = null;

export function getMunicipalRules(): Map<string, any> {
  if (municipalRulesCache) return municipalRulesCache;
  try {
    const filePath = path.join(process.cwd(), 'data', 'municipal_substitute_rules_2026.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const map = new Map<string, any>();
      (data.municipalities || []).forEach((m: any) => map.set(m.code, m));
      municipalRulesCache = map;
      return map;
    }
  } catch (e) {}
  return new Map();
}

export function getRegionalRules(): any {
  if (regionalRulesCache) return regionalRulesCache;
  try {
    const filePath = path.join(process.cwd(), 'data', 'regional_substitute_rules_2026.json');
    if (fs.existsSync(filePath)) {
      regionalRulesCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return regionalRulesCache;
    }
  } catch (e) {}
  return {
    election_year: 2026,
    default_rule: {
      type: 'per_member_per_constituency',
      formula: 'max(3, party_seats_in_constituency)'
    },
    regions: []
  };
}

/**
 * 8. Kommun – ersättare & 15. Testfall – kommun
 * Target = max(2, ceil(partySeats * substituteRatio))
 * Om kvoten inte har verifierats (ratio === null):
 * returnerar target_substitutes: null, status: 'incomplete', verified: false, samt skattad kvot 0.5.
 */
export function calculateMunicipalSubstituteRule(
  mandates: number,
  mCode: string
): MunicipalSubstituteRule {
  const rulesMap = getMunicipalRules();
  const ruleData = rulesMap.get(mCode);

  if (!ruleData || ruleData.substitute_ratio === null || !ruleData.verified) {
    const estimatedSubstitutes = mandates > 0 ? Math.max(2, Math.ceil(mandates * 0.5)) : 0;
    return {
      type: 'municipal_ratio',
      ratio: null,
      verified: false,
      target_count: null,
      estimated_substitutes: estimatedSubstitutes,
      assumed_ratio: 0.5,
      official: false,
      source_url: ruleData?.source_url || null,
      source_title: ruleData?.source_title || null,
      decision_date: ruleData?.decision_date || null
    };
  }

  const ratio = ruleData.substitute_ratio;
  const targetCount = mandates > 0 ? Math.max(2, Math.ceil(mandates * ratio)) : 0;
  return {
    type: 'municipal_ratio',
    ratio,
    verified: true,
    target_count: targetCount,
    official: true,
    source_url: ruleData.source_url || null,
    source_title: ruleData.source_title || null,
    decision_date: ruleData.decision_date || null
  };
}

/**
 * 7. Region – ersättare & 16. Testfall – region
 * target := max(3, partySeatsInConstituency)
 * Ersättare beräknas PER LEDAMOT i respektive valkrets.
 */
export function calculateRegionalSubstituteRule(): RegionalSubstituteRule {
  return {
    type: 'per_member_per_constituency',
    minimum: 3,
    formula: 'max(3, party_seats_in_constituency)'
  };
}

export function getRegionalSubstitutesPerMember(partySeatsInConstituency: number): number {
  if (partySeatsInConstituency <= 0) return 0;
  return Math.max(3, partySeatsInConstituency);
}

/**
 * Fullständig kandidatberäkning och Dubbelvalsavveckling (Vallagen 14 kap)
 */
export function calculateElectedMembersAndSubstitutes(params: {
  electionType: 'region' | 'kommun' | 'riksdag';
  constituencies: ConstituencyInput[];
  personVotesAvailable: boolean;
  isCountingComplete: boolean;
  municipalityCode?: string;
}): {
  members: ElectedMember[];
  substitutes: SubstituteAssignment[];
  status: ResultStatus;
  personVotesIncluded: boolean;
} {
  const { electionType, constituencies, personVotesAvailable, isCountingComplete, municipalityCode } = params;

  const resultStatus: ResultStatus = (isCountingComplete && personVotesAvailable) ? 'official' : 'projected';
  const personVotesIncluded = personVotesAvailable;

  // 1. Inledande kandidatsortering per valkrets
  const candidatesPerVk = new Map<string, EngineCandidateInput[]>();

  const personThresholdPct = 0.05;
  const minPersonVotes = electionType === 'region' ? 100 : 50;

  constituencies.forEach(c => {
    let sortedList = [...c.candidates];

    if (personVotesAvailable && c.totalPartyVotesInConstituency) {
      const voteThreshold = Math.max(minPersonVotes, c.totalPartyVotesInConstituency * personThresholdPct);
      const passedThreshold = sortedList
        .filter(cand => (cand.personalVotes || 0) >= voteThreshold)
        .sort((a, b) => (b.personalVotes || 0) - (a.personalVotes || 0));

      const passedNames = new Set(passedThreshold.map(p => p.name));
      const remaining = sortedList
        .filter(cand => !passedNames.has(cand.name))
        .sort((a, b) => a.order - b.order);

      sortedList = [...passedThreshold, ...remaining];
    } else {
      sortedList.sort((a, b) => a.order - b.order);
    }

    candidatesPerVk.set(c.id, sortedList);
  });

  // 2. Preliminär tilldelning av mandat per valkrets
  const provisionalElections: {
    constituencyId: string;
    constituencyName: string;
    candidate: EngineCandidateInput;
    seatIndex: number;
    comparisonVote: number;
  }[] = [];

  constituencies.forEach(c => {
    const seats = c.partySeats;
    const candList = candidatesPerVk.get(c.id) || [];
    for (let s = 0; s < seats; s++) {
      const cand = candList[s];
      if (cand) {
        const baseVotes = c.totalPartyVotesInConstituency || 10000;
        const comparisonVote = baseVotes / (s + 1);
        provisionalElections.push({
          constituencyId: c.id,
          constituencyName: c.name,
          candidate: cand,
          seatIndex: s,
          comparisonVote
        });
      }
    }
  });

  // 3. Dubbelvalsavveckling (Vallagen 14 kap 12-14 §§)
  const electedByCandidateName = new Map<string, typeof provisionalElections[0]>();
  const candSeatsMap = new Map<string, typeof provisionalElections>();

  provisionalElections.forEach(pe => {
    if (!candSeatsMap.has(pe.candidate.name)) candSeatsMap.set(pe.candidate.name, []);
    candSeatsMap.get(pe.candidate.name)!.push(pe);
  });

  const electedMembers: ElectedMember[] = [];
  const assignedCandidateNamesInConstituency = new Map<string, Set<string>>();

  constituencies.forEach(c => {
    assignedCandidateNamesInConstituency.set(c.id, new Set<string>());
  });

  constituencies.forEach(c => {
    const seats = c.partySeats;
    const candList = candidatesPerVk.get(c.id) || [];
    let allocated = 0;
    let listIdx = 0;

    while (allocated < seats && listIdx < candList.length) {
      const cand = candList[listIdx];
      listIdx++;

      const existingWins = Array.from(electedByCandidateName.entries()).filter(([name]) => name === cand.name);
      
      if (existingWins.length > 0) {
        const prevWin = existingWins[0][1];
        const currentCompVote = (c.totalPartyVotesInConstituency || 10000) / (allocated + 1);
        if (currentCompVote > prevWin.comparisonVote) {
          electedByCandidateName.delete(cand.name);
          assignedCandidateNamesInConstituency.get(prevWin.constituencyId)?.delete(cand.name);
        } else {
          continue;
        }
      }

      if (!assignedCandidateNamesInConstituency.get(c.id)!.has(cand.name)) {
        assignedCandidateNamesInConstituency.get(c.id)!.add(cand.name);
        const compVote = (c.totalPartyVotesInConstituency || 10000) / (allocated + 1);
        const winRecord = {
          constituencyId: c.id,
          constituencyName: c.name,
          candidate: cand,
          seatIndex: allocated,
          comparisonVote: compVote
        };
        electedByCandidateName.set(cand.name, winRecord);

        electedMembers.push({
          candidateId: cand.id,
          name: cand.name,
          constituencyId: c.id,
          constituencyName: c.name,
          seatType: 'ordinarie',
          status: resultStatus,
          substitutes: []
        });

        allocated++;
      }
    }
  });

  // 4. Ersättarberäkning
  const substitutes: SubstituteAssignment[] = [];
  const uniqueSubstituteNames = new Set<string>();

  if (electionType === 'region') {
    // Region: PER LEDAMOT i respektive valkrets (max(3, partySeatsInConstituency))
    const membersByVk = new Map<string, ElectedMember[]>();
    electedMembers.forEach(m => {
      if (!membersByVk.has(m.constituencyId)) membersByVk.set(m.constituencyId, []);
      membersByVk.get(m.constituencyId)!.push(m);
    });

    constituencies.forEach(c => {
      const vkMembers = membersByVk.get(c.id) || [];
      const seatsInVk = c.partySeats;
      if (seatsInVk <= 0 || vkMembers.length === 0) return;

      const subsNeededPerMember = getRegionalSubstitutesPerMember(seatsInVk);
      const candList = candidatesPerVk.get(c.id) || [];
      
      const electedInVk = assignedCandidateNamesInConstituency.get(c.id) || new Set();
      const availableCands = candList.filter(cand => !electedInVk.has(cand.name));

      vkMembers.forEach(member => {
        const memberSubs: SubstituteAssignment[] = [];
        for (let pos = 1; pos <= subsNeededPerMember && pos <= availableCands.length; pos++) {
          const subCand = availableCands[pos - 1];
          const subAssign: SubstituteAssignment = {
            memberId: member.candidateId,
            memberName: member.name,
            candidateId: subCand.id,
            candidateName: subCand.name,
            constituencyId: c.id,
            constituencyName: c.name,
            position: pos,
            status: resultStatus
          };
          memberSubs.push(subAssign);
          substitutes.push(subAssign);
          uniqueSubstituteNames.add(subCand.name);
        }
        member.substitutes = memberSubs;
      });
    });
  } else {
    // Kommun: partiets totala mandat i HELA kommunen
    const totalSeats = constituencies.reduce((sum, c) => sum + c.partySeats, 0);
    const mRule = calculateMunicipalSubstituteRule(totalSeats, municipalityCode || '');

    const targetSubstitutes = mRule.target_count ?? mRule.estimated_substitutes ?? 0;
    
    const allElectedNames = new Set(electedMembers.map(m => m.name));
    const unElectedCandidates: { cand: EngineCandidateInput; vkId: string; vkName: string }[] = [];

    constituencies.forEach(c => {
      const list = candidatesPerVk.get(c.id) || [];
      list.forEach(cand => {
        if (!allElectedNames.has(cand.name) && !unElectedCandidates.some(u => u.cand.name === cand.name)) {
          unElectedCandidates.push({ cand, vkId: c.id, vkName: c.name });
        }
      });
    });

    for (let pos = 1; pos <= targetSubstitutes && pos <= unElectedCandidates.length; pos++) {
      const item = unElectedCandidates[pos - 1];
      const subAssign: SubstituteAssignment = {
        candidateId: item.cand.id,
        candidateName: item.cand.name,
        constituencyId: item.vkId,
        constituencyName: item.vkName,
        position: pos,
        status: mRule.verified ? resultStatus : 'incomplete'
      };
      substitutes.push(subAssign);
      uniqueSubstituteNames.add(item.cand.name);
    }
  }

  return {
    members: electedMembers,
    substitutes,
    status: resultStatus,
    personVotesIncluded
  };
}
