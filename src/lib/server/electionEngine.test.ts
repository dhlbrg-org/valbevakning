import { 
  calculateMunicipalSubstituteRule, 
  calculateRegionalSubstituteRule, 
  getRegionalSubstitutesPerMember,
  calculateElectedMembersAndSubstitutes,
  getMunicipalRules,
  getRegionalRules
} from './electionEngine';
import type { ConstituencyInput } from './electionEngine';
import assert from 'assert';

console.log('--- Running Election Engine Unit Tests ---');

// 1. Dataset Tests
const mRules = getMunicipalRules();
assert.strictEqual(mRules.size, 290, 'Municipal rules dataset must contain exactly 290 municipalities');

const rRules = getRegionalRules();
assert.strictEqual(rRules.regions.length, 20, 'Regional rules dataset must contain exactly 20 regions');
assert.strictEqual(rRules.regions.includes('Gotland'), false, 'Gotland must NOT be included in regional rules');

console.log('✓ Datasets loaded and verified (290 municipalities, 20 regions, no Gotland).');

// 2. Test Cases – Kommun (Section 15)
// Mock rules mapping for test municipality 'TEST01' with ratio 0.5
mRules.set('TEST01', { code: 'TEST01', name: 'Testkommun', substitute_ratio: 0.5, verified: true });
mRules.set('TEST_UNKNOWN', { code: 'TEST_UNKNOWN', name: 'Okänd Kommun', substitute_ratio: null, verified: false });

// 1 mandat, kvot 0,5 => target_substitutes: 2
const k1 = calculateMunicipalSubstituteRule(1, 'TEST01');
assert.strictEqual(k1.target_count, 2, '1 mandate with ratio 0.5 must give 2 substitutes');

// 4 mandat, kvot 0,5 => target_substitutes: 2
const k4 = calculateMunicipalSubstituteRule(4, 'TEST01');
assert.strictEqual(k4.target_count, 2, '4 mandates with ratio 0.5 must give 2 substitutes');

// 5 mandat, kvot 0,5 => target_substitutes: 3
const k5 = calculateMunicipalSubstituteRule(5, 'TEST01');
assert.strictEqual(k5.target_count, 3, '5 mandates with ratio 0.5 must give 3 substitutes');

// 5 mandat, okänd kvot (null) => target_substitutes: null, status: 'incomplete', estimated: 3
const kUnknown = calculateMunicipalSubstituteRule(5, 'TEST_UNKNOWN');
assert.strictEqual(kUnknown.target_count, null, 'Unknown ratio must set target_count to null');
assert.strictEqual(kUnknown.verified, false, 'Unknown ratio must be unverified');
assert.strictEqual(kUnknown.estimated_substitutes, 3, 'Unknown ratio for 5 seats must estimate 3 substitutes');

console.log('✓ Municipal substitute test cases passed (1->2, 4->2, 5->3, unknown->null/estimated).');

// 3. Test Cases – Region (Section 16)
assert.strictEqual(getRegionalSubstitutesPerMember(1), 3, '1 seat in constituency => 3 substitutes per member');
assert.strictEqual(getRegionalSubstitutesPerMember(3), 3, '3 seats in constituency => 3 substitutes per member');
assert.strictEqual(getRegionalSubstitutesPerMember(4), 4, '4 seats in constituency => 4 substitutes per member');

// Multi-valkrets test: A=3, B=1 => 3 per member in A, 3 in B
const constsA3B1: ConstituencyInput[] = [
  {
    id: 'A',
    name: 'Valkrets A',
    partySeats: 3,
    candidates: Array.from({ length: 10 }, (_, i) => ({ id: `candA_${i}`, name: `Kandidat A${i+1}`, order: i + 1 }))
  },
  {
    id: 'B',
    name: 'Valkrets B',
    partySeats: 1,
    candidates: Array.from({ length: 10 }, (_, i) => ({ id: `candB_${i}`, name: `Kandidat B${i+1}`, order: i + 1 }))
  }
];

const resA3B1 = calculateElectedMembersAndSubstitutes({
  electionType: 'region',
  constituencies: constsA3B1,
  personVotesAvailable: false,
  isCountingComplete: false
});

const membersA = resA3B1.members.filter(m => m.constituencyId === 'A');
const membersB = resA3B1.members.filter(m => m.constituencyId === 'B');

assert.strictEqual(membersA.length, 3, 'Valkrets A should have 3 elected members');
assert.strictEqual(membersB.length, 1, 'Valkrets B should have 1 elected member');

membersA.forEach(m => {
  assert.strictEqual(m.substitutes?.length, 3, 'Each member in A (3 seats) must have 3 substitutes');
});

membersB.forEach(m => {
  assert.strictEqual(m.substitutes?.length, 3, 'Each member in B (1 seat) must have 3 substitutes');
});

// Multi-valkrets test: A=4, B=1 => 4 per member in A, 3 in B
const constsA4B1: ConstituencyInput[] = [
  {
    id: 'A',
    name: 'Valkrets A',
    partySeats: 4,
    candidates: Array.from({ length: 10 }, (_, i) => ({ id: `candA_${i}`, name: `Kandidat A${i+1}`, order: i + 1 }))
  },
  {
    id: 'B',
    name: 'Valkrets B',
    partySeats: 1,
    candidates: Array.from({ length: 10 }, (_, i) => ({ id: `candB_${i}`, name: `Kandidat B${i+1}`, order: i + 1 }))
  }
];

const resA4B1 = calculateElectedMembersAndSubstitutes({
  electionType: 'region',
  constituencies: constsA4B1,
  personVotesAvailable: false,
  isCountingComplete: false
});

const membersA4 = resA4B1.members.filter(m => m.constituencyId === 'A');
const membersB1 = resA4B1.members.filter(m => m.constituencyId === 'B');

membersA4.forEach(m => {
  assert.strictEqual(m.substitutes?.length, 4, 'Each member in A (4 seats) must have 4 substitutes');
});

membersB1.forEach(m => {
  assert.strictEqual(m.substitutes?.length, 3, 'Each member in B (1 seat) must have 3 substitutes');
});

console.log('✓ Regional substitute test cases passed (A=3,B=1 => 3&3, A=4,B=1 => 4&3).');

// 4. Test Dubbelvalsavveckling
const constsDubbelval: ConstituencyInput[] = [
  {
    id: 'A',
    name: 'Valkrets A',
    partySeats: 1,
    totalPartyVotesInConstituency: 2000,
    candidates: [
      { id: 'cand_shared', name: 'Gemensam Kandidat', order: 1 },
      { id: 'cand_a2', name: 'Kandidat A2', order: 2 }
    ]
  },
  {
    id: 'B',
    name: 'Valkrets B',
    partySeats: 1,
    totalPartyVotesInConstituency: 1000,
    candidates: [
      { id: 'cand_shared', name: 'Gemensam Kandidat', order: 1 },
      { id: 'cand_b2', name: 'Kandidat B2', order: 2 }
    ]
  }
];

const resDubbel = calculateElectedMembersAndSubstitutes({
  electionType: 'region',
  constituencies: constsDubbelval,
  personVotesAvailable: false,
  isCountingComplete: false
});

const electedShared = resDubbel.members.find(m => m.name === 'Gemensam Kandidat');
assert.ok(electedShared, 'Gemensam Kandidat should be elected');
assert.strictEqual(electedShared?.constituencyId, 'A', 'Gemensam Kandidat should win in Constituency A (2000 votes vs 1000 votes)');

const electedInB = resDubbel.members.find(m => m.constituencyId === 'B');
assert.strictEqual(electedInB?.name, 'Kandidat B2', 'Constituency B seat should pass to Kandidat B2 after double-election resolution');

console.log('✓ Dubbelvalsavveckling test passed (shared candidate won in higher vote constituency, second candidate won in second constituency).');

console.log('All unit tests passed successfully!');
