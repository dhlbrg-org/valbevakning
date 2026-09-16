export interface PartyMandate {
  code: string;
  name: string;
  mandates: number;
  mandatesChange?: number;
}

export interface Candidate {
  order: number;
  name: string;
  age?: string;
  info?: string;
  role?: 'Ordinarie' | 'Ersättare';
  valkrets?: string;
}

export interface CandidateList {
  listNumber: string;
  listName: string;
  isLocal?: boolean;
  candidates: Candidate[];
}

export interface MatchedDiff {
  finalVotes: number;
  finalVotesPct: number;
  comparisonVotes: number;
  comparisonVotesPct: number;
  votesDiff: number;
  votesPctDiff: number;
  districtsCounted?: number;
  districtsTotal?: number;
}

export interface RiksdagDiff extends MatchedDiff {
  mandatesDiff: number;
  preliminaryVotes: number;
  preliminaryVotesPct: number;
  preliminaryMandates: number;
  finalMandates: number;
}

export interface RegionResult {
  code: string;
  name: string;
  mpMandates: number;
  mpMandatesChange: number;
  mpVotesPct: number;
  mpVotesPctChange: number;
  mpVotesCount: number;
  mpVotesCountChange: number;
  totalValidVotes: number;
  thresholdVotesCount: number;
  thresholdPct?: number;
  votesDiffFromThreshold: number;
  totalMandates: number;
  districtsCounted: number;
  districtsTotal: number;
  hasMandate: boolean;
  isCountingComplete: boolean;
  isNewRegionWithMandate: boolean;
  partyMandates: PartyMandate[];
  votesToNextMandate: number;
  votesToLoseMandate: number;
  hasRegisteredMpList?: boolean;
  candidates?: Candidate[];
  candidateLists?: CandidateList[];
  diffVsPreliminary?: MatchedDiff;
  diffVsPrevious?: MatchedDiff;
}

export type MunicipalityResult = RegionResult;

export interface PollSummary {
  totalMpMandates: number;
  totalMpMandatesChange: number;
  totalMpVotes: number;
  totalMpVotesChange: number;
  regionsWithMandatesCount: number;
  newlyGainedRegionsCount: number;
  regionsBelowThresholdCount: number;
  totalVotesNeededBelowThreshold: number;
  totalRegions: number;
  totalDistrictsCounted: number;
  totalDistrictsTotal: number;
  averageMpVotePct: number;
  averageMpVotePctChange: number;
}

export interface PollResponse {
  timestamp: string;
  source: 'live' | 'cache';
  status: 'success' | 'error';
  electionYear: string;
  countingPhase: string;
  summary: PollSummary;
  regions: RegionResult[];
  errorDetails?: string;
}

export interface MunicipalityPollResponse extends Omit<PollResponse, 'regions'> {
  municipalities: MunicipalityResult[];
}

export interface RiksdagResult extends RegionResult {
  diffVsPreliminary?: RiksdagDiff;
  diffVsPrevious?: MatchedDiff;
}

export interface RiksdagPollResponse extends Omit<PollResponse, 'regions'> {
  valkretsar: RiksdagResult[];
  nationalResult: RiksdagResult;
  diffVsPreliminary?: RiksdagDiff;
  diffVsPrevious?: MatchedDiff;
}

export type ResultStatus = 'official' | 'projected' | 'incomplete';

export interface SubstituteAssignment {
  memberId?: string;
  memberName?: string;
  candidateId?: string;
  candidateName: string;
  constituencyId: string;
  constituencyName?: string;
  position: number;
  status: ResultStatus;
}

export interface ElectedMember {
  candidateId?: string;
  name: string;
  constituencyId: string;
  constituencyName?: string;
  seatType?: string;
  status: ResultStatus;
  substitutes?: SubstituteAssignment[];
}

export interface MunicipalSubstituteRule {
  type: 'municipal_ratio';
  ratio: number | null;
  verified: boolean;
  target_count: number | null;
  estimated_substitutes?: number;
  assumed_ratio?: number;
  official?: boolean;
  source_url?: string | null;
  source_title?: string | null;
  decision_date?: string | null;
}

export interface RegionalSubstituteRule {
  type: 'per_member_per_constituency';
  minimum: number;
  formula?: string;
}

export interface ConstituencySeats {
  id: string;
  name: string;
  fixed_seats?: number;
  adjustment_seats?: number;
  party_seats: number;
}

export interface PartyApiResult {
  party: string;
  election_id: string;
  election_name?: string;
  election_type: 'region' | 'kommun' | 'riksdag';
  mandates: {
    total: number;
    by_constituency: ConstituencySeats[];
  };
  members: {
    status: ResultStatus;
    reason?: string;
    person_votes_included: boolean;
    items: ElectedMember[];
  };
  substitutes: {
    status: ResultStatus;
    items: SubstituteAssignment[];
    unique_count: number;
  };
  substitute_rule: MunicipalSubstituteRule | RegionalSubstituteRule;
  provenance: {
    source: string;
    source_url?: string;
    retrieved_at: string;
    election_year: number;
  };
}
