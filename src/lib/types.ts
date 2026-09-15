export interface PartyMandate {
  code: string;
  name: string;
  mandates: number;
  mandatesChange?: number;
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
  source: 'live';
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
