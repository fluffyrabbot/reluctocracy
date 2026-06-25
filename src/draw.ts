import type { JsonValue } from "./canonical.ts";
import type {
  DrawEvent,
  PoolEpochEvent,
  PoolMember,
  RandomBeaconEvent,
  Ref,
  TrustFragilityFlag
} from "./events.ts";
import { hashJson } from "./log.ts";

export const drawAlgorithm = "reluctocracy.draw.public-hash-sort-v1";

const defaultFairnessSampleCount = 2048;
const defaultFairnessMaxAbsoluteDeviation = 0.06;
const defaultSeedStabilityThreshold = 1;

export type DeterministicDrawInput = {
  readonly poolEpoch: PoolEpochEvent;
  readonly randomBeacon: RandomBeaconEvent;
  readonly panelSize: number;
  readonly diversityConstraints: JsonValue;
};

export type NormalizedDrawConstraints = {
  readonly algorithm: typeof drawAlgorithm;
  readonly minimumDistinctStrata: number;
  readonly panelSize: number;
};

export type RankedDrawMember = {
  readonly identityRef: Ref;
  readonly rank: string;
  readonly strata: readonly string[];
  readonly trustRank: number;
};

export type PublicDrawEvaluation = {
  readonly algorithm: typeof drawAlgorithm;
  readonly constraints: NormalizedDrawConstraints;
  readonly poolFingerprint: string;
  readonly rankedPool: readonly RankedDrawMember[];
  readonly selectedPanel: readonly Ref[];
};

export type PublicDrawRule = {
  readonly algorithm: typeof drawAlgorithm;
  readonly evaluate: (input: DeterministicDrawInput) => PublicDrawEvaluation;
};

export type DrawFairnessAuditInput = {
  readonly poolEpoch: PoolEpochEvent;
  readonly panelSize: number;
  readonly diversityConstraints: JsonValue;
  readonly sampleCount?: number;
  readonly maxAbsoluteDeviation?: number;
  readonly sampleSalt?: string;
};

export type DrawFairnessAudit = {
  readonly passed: boolean;
  readonly algorithm: typeof drawAlgorithm;
  readonly sampleCount: number;
  readonly maxAbsoluteDeviation: number;
  readonly expectedSelectionRateByIdentity: Readonly<Record<Ref, number>>;
  readonly observedSelectionRateByIdentity: Readonly<Record<Ref, number>>;
  readonly failures: readonly string[];
};

export type SeedSetStabilityInput = {
  readonly draw: DrawEvent;
  readonly basePoolEpoch: PoolEpochEvent;
  readonly comparisonPoolEpochs: readonly PoolEpochEvent[];
  readonly randomBeacon: RandomBeaconEvent;
  readonly stabilityThreshold?: number;
};

export type SeedSetStabilityAssessment = {
  readonly stable: boolean;
  readonly replay: SeedSetSensitivityReplay;
  readonly flags: readonly TrustFragilityFlag[];
};

export type SeedSetSensitivityForkReplay = {
  readonly comparisonPoolEpochRef: Ref;
  readonly seedSet: readonly Ref[];
  readonly poolFingerprint: string;
  readonly selectedPanel: readonly Ref[];
  readonly poolOverlap: number;
  readonly selectedPanelOverlap: number;
  readonly fragile: boolean;
  readonly trustFragilityFlag?: TrustFragilityFlag;
};

export type SeedSetSensitivityReplay = {
  readonly algorithm: typeof drawAlgorithm;
  readonly basePoolEpochRef: Ref;
  readonly baseSeedSet: readonly Ref[];
  readonly basePoolFingerprint: string;
  readonly baseSelectedPanel: readonly Ref[];
  readonly stabilityThreshold: number;
  readonly forks: readonly SeedSetSensitivityForkReplay[];
  readonly flags: readonly TrustFragilityFlag[];
  readonly stable: boolean;
};

type NormalizedPoolMember = {
  readonly identityRef: Ref;
  readonly strata: readonly string[];
  readonly trustRank: number;
};

export const publicHashSortDrawRule: PublicDrawRule = {
  algorithm: drawAlgorithm,
  evaluate: evaluatePublicDrawRule
};

export function evaluatePublicDrawRule(input: DeterministicDrawInput): PublicDrawEvaluation {
  const constraints = normalizeDrawConstraints(input.diversityConstraints, input.panelSize);
  if (constraints.panelSize > input.poolEpoch.members.length) {
    throw new Error("draw panelSize cannot exceed pool member count");
  }

  const normalizedPool = normalizePoolMembers(input.poolEpoch.members);
  const poolFingerprint = fingerprintDrawPool(input.poolEpoch);
  const ranked = normalizedPool
    .map((member) => ({
      identityRef: member.identityRef,
      rank: hashJson({
        algorithm: drawAlgorithm,
        beaconRandomness: input.randomBeacon.randomness,
        beaconRound: input.randomBeacon.round,
        identityRef: member.identityRef,
        poolFingerprint
      }),
      strata: member.strata,
      trustRank: member.trustRank
    }))
    .sort(compareRankedMembers);

  return {
    algorithm: drawAlgorithm,
    constraints,
    poolFingerprint,
    rankedPool: ranked,
    selectedPanel: selectDiversePanel(ranked, constraints).map((member) => member.identityRef)
  };
}

export function recomputeDrawPanel(input: DeterministicDrawInput): readonly Ref[] {
  return publicHashSortDrawRule.evaluate(input).selectedPanel;
}

export function validateDrawRecomputation(
  draw: DrawEvent,
  poolEpoch: PoolEpochEvent,
  randomBeacon: RandomBeaconEvent
): readonly string[] {
  const failures: string[] = [];

  if (new Set(draw.selectedPanel).size !== draw.selectedPanel.length) {
    failures.push(`${draw.drawId}: selectedPanel contains duplicate identity refs`);
  }

  try {
    const recomputed = recomputeDrawPanel({
      diversityConstraints: draw.diversityConstraints,
      panelSize: draw.selectedPanel.length,
      poolEpoch,
      randomBeacon
    });
    if (!sameOrderedRefs(recomputed, draw.selectedPanel)) {
      failures.push(
        `${draw.drawId}: selectedPanel ${formatRefs(draw.selectedPanel)} does not match recomputed ${formatRefs(recomputed)}`
      );
    }
  } catch (error) {
    failures.push(`${draw.drawId}: ${errorMessage(error)}`);
  }

  return failures;
}

export function auditDrawFairness(input: DrawFairnessAuditInput): DrawFairnessAudit {
  const sampleCount = input.sampleCount ?? defaultFairnessSampleCount;
  const maxAbsoluteDeviation =
    input.maxAbsoluteDeviation ?? defaultFairnessMaxAbsoluteDeviation;
  const normalizedPool = normalizePoolMembers(input.poolEpoch.members);
  const constraints = normalizeDrawConstraints(input.diversityConstraints, input.panelSize);
  const failures: string[] = [];

  if (sampleCount <= 0 || !Number.isInteger(sampleCount)) {
    throw new Error("fairness audit sampleCount must be a positive integer");
  }
  if (maxAbsoluteDeviation < 0 || maxAbsoluteDeviation > 1) {
    throw new Error("fairness audit maxAbsoluteDeviation must be between 0 and 1");
  }

  if (!hasUniformTrustRank(normalizedPool)) {
    failures.push(
      "non-uniform trustRank calibration is not proven by the equal-ticket hash-sort audit"
    );
  }

  const expectedSelectionRate = constraints.panelSize / normalizedPool.length;
  const expectedSelectionRateByIdentity = Object.fromEntries(
    normalizedPool.map((member) => [member.identityRef, expectedSelectionRate])
  ) as Readonly<Record<Ref, number>>;
  const counts = new Map<Ref, number>(normalizedPool.map((member) => [member.identityRef, 0]));
  const sampleSalt = input.sampleSalt ?? "inv-2-forked-beacons";
  const poolFingerprint = fingerprintDrawPool(input.poolEpoch);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const randomBeacon = forkRandomBeacon(poolFingerprint, sampleSalt, sampleIndex);
    const selectedPanel = recomputeDrawPanel({
      diversityConstraints: input.diversityConstraints,
      panelSize: input.panelSize,
      poolEpoch: input.poolEpoch,
      randomBeacon
    });
    for (const identityRef of selectedPanel) {
      counts.set(identityRef, (counts.get(identityRef) ?? 0) + 1);
    }
  }

  const observedSelectionRateByIdentity = Object.fromEntries(
    normalizedPool.map((member) => [
      member.identityRef,
      roundMetric((counts.get(member.identityRef) ?? 0) / sampleCount)
    ])
  ) as Readonly<Record<Ref, number>>;

  for (const member of normalizedPool) {
    const observed = observedSelectionRateByIdentity[member.identityRef];
    if (observed === undefined) {
      failures.push(`${member.identityRef}: missing observed selection rate`);
      continue;
    }

    const deviation = Math.abs(observed - expectedSelectionRate);
    if (deviation > maxAbsoluteDeviation) {
      failures.push(
        `${member.identityRef}: observed selection rate ${formatMetric(observed)} diverges from equal-ticket pool share ${formatMetric(expectedSelectionRate)} by ${formatMetric(deviation)}`
      );
    }
  }

  return {
    algorithm: drawAlgorithm,
    expectedSelectionRateByIdentity,
    failures,
    maxAbsoluteDeviation,
    observedSelectionRateByIdentity,
    passed: failures.length === 0,
    sampleCount
  };
}

export function deriveTrustFragilityFlagsForDraw(
  input: SeedSetStabilityInput
): readonly TrustFragilityFlag[] {
  return replaySeedSetSensitivity(input).flags;
}

export function replaySeedSetSensitivity(
  input: SeedSetStabilityInput
): SeedSetSensitivityReplay {
  const threshold = input.stabilityThreshold ?? defaultSeedStabilityThreshold;
  if (threshold < 0 || threshold > 1) {
    throw new Error("seed stability threshold must be between 0 and 1");
  }

  const baseSelectedPanel = recomputeDrawPanel({
    diversityConstraints: input.draw.diversityConstraints,
    panelSize: input.draw.selectedPanel.length,
    poolEpoch: input.basePoolEpoch,
    randomBeacon: input.randomBeacon
  });
  const baseMembers = identitySet(input.basePoolEpoch.members);
  const basePoolFingerprint = fingerprintDrawPool(input.basePoolEpoch);

  const forks = input.comparisonPoolEpochs.map((comparisonPoolEpoch) => {
    const comparisonMembers = identitySet(comparisonPoolEpoch.members);
    const poolOverlap = roundMetric(jaccardOverlap(baseMembers, comparisonMembers));
    const selectedPanel = recomputeDrawPanel({
      diversityConstraints: input.draw.diversityConstraints,
      panelSize: input.draw.selectedPanel.length,
      poolEpoch: comparisonPoolEpoch,
      randomBeacon: input.randomBeacon
    });
    const selectedPanelOverlap = roundMetric(
      jaccardOverlap(new Set(baseSelectedPanel), new Set(selectedPanel))
    );
    const fragile = poolOverlap < threshold || selectedPanelOverlap < threshold;

    const trustFragilityFlag = fragile
      ? ({
          comparedPoolEpochRefs: [
            input.basePoolEpoch.poolEpochId,
            comparisonPoolEpoch.poolEpochId
          ],
          independentSeedSets: [
            input.basePoolEpoch.seedSet,
            comparisonPoolEpoch.seedSet
          ],
          kind: "pool_seed_instability",
          poolOverlap,
          selectedPanelOverlap,
          stabilityThreshold: threshold,
          untrustworthy: true
        } satisfies TrustFragilityFlag)
      : undefined;

    return {
      comparisonPoolEpochRef: comparisonPoolEpoch.poolEpochId,
      seedSet: comparisonPoolEpoch.seedSet,
      poolFingerprint: fingerprintDrawPool(comparisonPoolEpoch),
      selectedPanel,
      poolOverlap,
      selectedPanelOverlap,
      fragile,
      ...(trustFragilityFlag === undefined ? {} : { trustFragilityFlag })
    } satisfies SeedSetSensitivityForkReplay;
  });
  const flags = forks.flatMap((fork) =>
    fork.trustFragilityFlag === undefined ? [] : [fork.trustFragilityFlag]
  );

  return {
    algorithm: drawAlgorithm,
    basePoolEpochRef: input.basePoolEpoch.poolEpochId,
    baseSeedSet: input.basePoolEpoch.seedSet,
    basePoolFingerprint,
    baseSelectedPanel,
    flags,
    forks,
    stabilityThreshold: threshold,
    stable: flags.length === 0
  };
}

export function assessSeedSetStability(
  input: SeedSetStabilityInput
): SeedSetStabilityAssessment {
  const replay = replaySeedSetSensitivity(input);
  return {
    flags: replay.flags,
    replay,
    stable: replay.stable
  };
}

export function comparableIndependentSeedForks(
  left: PoolEpochEvent,
  right: PoolEpochEvent
): boolean {
  return (
    left.poolEpochId !== right.poolEpochId &&
    hashJson(left.window) === hashJson(right.window) &&
    hashJson(left.propagationParams) === hashJson(right.propagationParams) &&
    areDisjoint(left.seedSet, right.seedSet)
  );
}

export function trustFragilityFlagMatches(
  expected: TrustFragilityFlag,
  actual: TrustFragilityFlag
): boolean {
  return (
    sameOrderedRefs(expected.comparedPoolEpochRefs, actual.comparedPoolEpochRefs) &&
    sameOrderedRefs(expected.independentSeedSets[0], actual.independentSeedSets[0]) &&
    sameOrderedRefs(expected.independentSeedSets[1], actual.independentSeedSets[1]) &&
    actual.poolOverlap === expected.poolOverlap &&
    actual.selectedPanelOverlap === expected.selectedPanelOverlap &&
    actual.stabilityThreshold === expected.stabilityThreshold
  );
}

export function fingerprintDrawPool(poolEpoch: PoolEpochEvent): string {
  return hashJson({
    algorithm: drawAlgorithm,
    members: normalizePoolMembers(poolEpoch.members)
  } as unknown as JsonValue);
}

export function normalizeDrawConstraints(
  diversityConstraints: JsonValue,
  selectedPanelSize: number
): NormalizedDrawConstraints {
  if (
    diversityConstraints === null ||
    typeof diversityConstraints !== "object" ||
    Array.isArray(diversityConstraints)
  ) {
    throw new Error("diversityConstraints must be an object");
  }

  const constraints = diversityConstraints;
  if (constraints.algorithm !== drawAlgorithm) {
    throw new Error(`diversityConstraints.algorithm must be ${drawAlgorithm}`);
  }

  const panelSize = constraints.panelSize ?? selectedPanelSize;
  if (!isNonNegativeInteger(panelSize) || panelSize === 0) {
    throw new Error("diversityConstraints.panelSize must be a positive integer");
  }
  if (panelSize !== selectedPanelSize) {
    throw new Error("diversityConstraints.panelSize must match selectedPanel length");
  }

  const minimumDistinctStrata = constraints.minimumDistinctStrata ?? 0;
  if (
    !isNonNegativeInteger(minimumDistinctStrata) ||
    minimumDistinctStrata > panelSize
  ) {
    throw new Error(
      "diversityConstraints.minimumDistinctStrata must be an integer between 0 and panelSize"
    );
  }

  return {
    algorithm: drawAlgorithm,
    minimumDistinctStrata,
    panelSize
  };
}

function selectDiversePanel(
  ranked: readonly RankedDrawMember[],
  constraints: NormalizedDrawConstraints
): readonly RankedDrawMember[] {
  const selected: RankedDrawMember[] = [];
  const selectedIdentityRefs = new Set<Ref>();
  const coveredStrata = new Set<string>();
  const availableStrata = new Set(ranked.flatMap((member) => member.strata));
  const targetDistinctStrata = Math.min(
    constraints.minimumDistinctStrata,
    availableStrata.size,
    constraints.panelSize
  );

  while (
    selected.length < constraints.panelSize &&
    coveredStrata.size < targetDistinctStrata
  ) {
    const next = ranked.find(
      (member) =>
        !selectedIdentityRefs.has(member.identityRef) &&
        member.strata.some((stratum) => !coveredStrata.has(stratum))
    );
    if (next === undefined) {
      break;
    }
    selectMember(next, selected, selectedIdentityRefs, coveredStrata);
  }

  for (const member of ranked) {
    if (selected.length >= constraints.panelSize) {
      break;
    }
    if (!selectedIdentityRefs.has(member.identityRef)) {
      selectMember(member, selected, selectedIdentityRefs, coveredStrata);
    }
  }

  return selected;
}

function selectMember(
  member: RankedDrawMember,
  selected: RankedDrawMember[],
  selectedIdentityRefs: Set<Ref>,
  coveredStrata: Set<string>
): void {
  selected.push(member);
  selectedIdentityRefs.add(member.identityRef);
  for (const stratum of member.strata) {
    coveredStrata.add(stratum);
  }
}

function normalizePoolMembers(members: readonly PoolMember[]): readonly NormalizedPoolMember[] {
  const seenIdentityRefs = new Set<Ref>();
  return members
    .map((member) => {
      if (seenIdentityRefs.has(member.identityRef)) {
        throw new Error(`pool epoch contains duplicate identityRef ${member.identityRef}`);
      }
      seenIdentityRefs.add(member.identityRef);

      if (!Number.isFinite(member.trustRank)) {
        throw new Error(`${member.identityRef}: trustRank must be finite`);
      }

      return {
        identityRef: member.identityRef,
        strata: [...member.strata].sort(),
        trustRank: member.trustRank
      };
    })
    .sort((left, right) => left.identityRef.localeCompare(right.identityRef));
}

function compareRankedMembers(left: RankedDrawMember, right: RankedDrawMember): number {
  const rankOrder = left.rank.localeCompare(right.rank);
  if (rankOrder !== 0) {
    return rankOrder;
  }
  return left.identityRef.localeCompare(right.identityRef);
}

function sameOrderedRefs(left: readonly Ref[], right: readonly Ref[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatRefs(refs: readonly Ref[]): string {
  return `[${refs.join(", ")}]`;
}

function forkRandomBeacon(
  poolFingerprint: string,
  sampleSalt: string,
  sampleIndex: number
): RandomBeaconEvent {
  const randomness = hashJson({
    algorithm: drawAlgorithm,
    poolFingerprint,
    sampleIndex,
    sampleSalt
  });
  return {
    proof: `deterministic-fork:${sampleSalt}:${String(sampleIndex)}`,
    randomness,
    round: `fork:${sampleSalt}:${String(sampleIndex)}`
  };
}

function hasUniformTrustRank(members: readonly NormalizedPoolMember[]): boolean {
  const firstTrustRank = members[0]?.trustRank;
  return firstTrustRank !== undefined && members.every((member) => member.trustRank === firstTrustRank);
}

function identitySet(members: readonly PoolMember[]): Set<Ref> {
  return new Set(members.map((member) => member.identityRef));
}

function jaccardOverlap(left: ReadonlySet<Ref>, right: ReadonlySet<Ref>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 1;
  }

  let intersectionSize = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersectionSize += 1;
    }
  }
  return intersectionSize / union.size;
}

function areDisjoint(left: readonly Ref[], right: readonly Ref[]): boolean {
  const rightRefs = new Set(right);
  return left.every((ref) => !rightRefs.has(ref));
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatMetric(value: number): string {
  return roundMetric(value).toFixed(6);
}

function isNonNegativeInteger(value: JsonValue): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
