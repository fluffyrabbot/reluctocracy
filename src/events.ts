import type { JsonObject, JsonValue } from "./canonical.ts";

export const protocolSchemaVersion = "reluctocracy.protocol.v0";

export type ProtocolSchemaVersion = typeof protocolSchemaVersion;

export type EventType =
  | "Identity"
  | "Attestation"
  | "Vouch"
  | "Slash"
  | "Stratum"
  | "PoolEpoch"
  | "RandomBeacon"
  | "Draw"
  | "AgendaItem"
  | "Deliberation"
  | "Briefing"
  | "Claim"
  | "Rebuttal"
  | "SuspicionClaim"
  | "CredenceModel"
  | "CredencePrior"
  | "CredenceFeatureWeight"
  | "CredenceEvidenceFamily"
  | "CredenceEvidenceDiscountRule"
  | "Credence"
  | "Lens"
  | "CurationAct"
  | "Summary"
  | "Dokimasia"
  | "Judgment"
  | "Provenance"
  | "Euthyna";

export type Ref = string;
export type IsoDateTime = string;

export type ChallengeWindow = {
  readonly opensAt: IsoDateTime;
  readonly closesAt: IsoDateTime;
};

export type ProbabilityRange = {
  readonly lower: number;
  readonly upper: number;
};

export type IdentityEvent = {
  readonly publicKey: string;
  readonly pseudonym: string;
};

export type AttestationEvent = {
  readonly identityRef: Ref;
  readonly communityId: string;
  readonly zkMembershipProof: string;
  readonly issuedAt: IsoDateTime;
};

export type VouchEvent = {
  readonly fromIdentityRef: Ref;
  readonly toIdentityRef: Ref;
  readonly stake: number;
  readonly issuedAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
  readonly signature: string;
};

export type SlashEvent = {
  readonly targetVoucherRef: Ref;
  readonly cause: string;
  readonly capacityDelta: number;
};

export type StratumEvent = {
  readonly identityRef: Ref;
  readonly tag: string;
  readonly attestationRefs: readonly Ref[];
};

export type PoolMember = {
  readonly identityRef: Ref;
  readonly trustRank: number;
  readonly strata: readonly string[];
};

export type PoolEpochEvent = {
  readonly poolEpochId: Ref;
  readonly window: ChallengeWindow;
  readonly seedSet: readonly Ref[];
  readonly propagationParams: JsonObject;
  readonly members: readonly PoolMember[];
};

export type RandomBeaconEvent = {
  readonly round: string;
  readonly randomness: string;
  readonly proof: string;
};

export type TrustFragilityFlag = {
  readonly kind: "pool_seed_instability";
  readonly comparedPoolEpochRefs: readonly [Ref, Ref];
  readonly independentSeedSets: readonly [readonly Ref[], readonly Ref[]];
  readonly poolOverlap: number;
  readonly selectedPanelOverlap: number;
  readonly stabilityThreshold: number;
  readonly untrustworthy: true;
};

export type DrawEvent = {
  readonly drawId: Ref;
  readonly poolEpochRef: Ref;
  readonly beaconRound: string;
  readonly diversityConstraints: JsonValue;
  readonly selectedPanel: readonly Ref[];
  readonly trustFragilityFlags?: readonly TrustFragilityFlag[];
};

export type AgendaItemEvent = {
  readonly agendaId: Ref;
  readonly proposerRef: Ref;
  readonly framing: string;
  readonly challengeWindow: ChallengeWindow;
  readonly contestable: true;
};

export type DeliberationState =
  | "PROPOSE"
  | "FRAME"
  | "DRAW"
  | "DOKIMASIA"
  | "DELIBERATE"
  | "SYNTHESIZE"
  | "PUBLISH"
  | "EUTHYNA";

export type DeliberationEvent = {
  readonly deliberationId: Ref;
  readonly agendaRef: Ref;
  readonly panelRef: Ref;
  readonly expertRefs: readonly Ref[];
  readonly lifecycleState: DeliberationState;
};

export type BriefingSide = "blue" | "red";

export type BriefingEvent = {
  readonly briefingId: Ref;
  readonly authorRef: Ref;
  readonly side: BriefingSide;
  readonly fundingDisclosure: string;
  readonly options: readonly [string, string, ...string[]];
};

export type ClaimRole = "curator" | "expert" | "panelist" | "public";

export type ClaimEvent = {
  readonly claimId: Ref;
  readonly authorRef: Ref;
  readonly role: ClaimRole;
  readonly content: string;
  readonly claimType: string;
};

export type RebuttalEvent = {
  readonly rebuttalId: Ref;
  readonly targetClaimRef: Ref;
  readonly content: string;
  readonly basisRefs?: readonly [Ref, ...Ref[]];
};

export type SuspicionClaimEvent = {
  readonly suspicionClaimId: Ref;
  readonly targetRef: Ref;
  readonly predictIfTrue: string;
  readonly predictIfFalse: string;
  readonly evidenceFor: readonly Ref[];
  readonly evidenceAgainst: readonly Ref[];
  readonly credence: ProbabilityRange;
};

export type CredenceEvent = {
  readonly credenceId: Ref;
  readonly targetRef: Ref;
  readonly modelRef: Ref;
  readonly priorRef: Ref;
  readonly featureWeightRefs: readonly [Ref, ...Ref[]];
  readonly posterior: ProbabilityRange;
  readonly basis: readonly Ref[];
  readonly recordedAt: IsoDateTime;
};

export type CredenceModelEvent = {
  readonly modelId: Ref;
  readonly label: string;
  readonly version: string;
  readonly target: "capture_probability";
  readonly authorRef: Ref;
  readonly rationale: string;
  readonly contestable: true;
};

export type CredencePriorEvent = {
  readonly priorId: Ref;
  readonly modelRef: Ref;
  readonly label: string;
  readonly probability: number;
  readonly bandHalfWidth: number;
  readonly basis: readonly Ref[];
  readonly authorRef: Ref;
  readonly rationale: string;
  readonly contestable: true;
};

export type CredenceFeatureName =
  | "position_clustering_anomaly"
  | "stratum_position_decorrelation"
  | "surviving_suspicion_claim"
  | "t0_t1_shift_synchrony";

export type CredenceFeatureWeightEvent = {
  readonly featureWeightId: Ref;
  readonly modelRef: Ref;
  readonly feature: CredenceFeatureName;
  readonly neutralObservedValue: number;
  readonly logLikelihoodScale: number;
  readonly weight: number;
  readonly basis: readonly Ref[];
  readonly authorRef: Ref;
  readonly rationale: string;
  readonly contestable: true;
};

export type CredenceEvidenceFamilyEvent = {
  readonly evidenceFamilyId: Ref;
  readonly modelRef: Ref;
  readonly label: string;
  readonly featureWeightRefs: readonly [Ref, ...Ref[]];
  readonly basis: readonly Ref[];
  readonly authorRef: Ref;
  readonly rationale: string;
  readonly contestable: true;
};

export type CredenceEvidenceDiscountRuleEvent = {
  readonly discountRuleId: Ref;
  readonly modelRef: Ref;
  readonly evidenceFamilyRef: Ref;
  readonly discountMultiplier: number;
  readonly basis: readonly Ref[];
  readonly authorRef: Ref;
  readonly rationale: string;
  readonly contestable: true;
};

export type LensTarget = "claim";

export type LensTieBreaker = "event_hash_asc";

export type ChronologicalLensRule = {
  readonly kind: "chronological";
  readonly direction: "newest_first" | "oldest_first";
  readonly timestamp: "record_appended_at";
  readonly tieBreaker: LensTieBreaker;
};

export type ContestednessLensRule = {
  readonly kind: "contestedness";
  readonly direction: "most_contested_first" | "least_contested_first";
  readonly signal: "rebuttal_count";
  readonly tieBreaker: LensTieBreaker;
};

export type LensRule = ChronologicalLensRule | ContestednessLensRule;

export type LensEvent = {
  readonly lensId: Ref;
  readonly name: string;
  readonly description: string;
  readonly target: LensTarget;
  readonly rule: LensRule;
};

export type CurationActType = "procedural_label" | "rank_weight" | "summary";

export type ProceduralLabelRule =
  | "procedural-label:ad-hominem"
  | "procedural-label:duplicate"
  | "procedural-label:unsupported-assertion";

export type CurationActBase = {
  readonly curationActId: Ref;
  readonly authorRef: Ref;
  readonly citedRule: string;
  readonly targetRef: Ref;
  readonly evidenceRefs: readonly [Ref, ...Ref[]];
  readonly rationale: string;
  readonly contestable: true;
};

export type ProceduralLabelCurationActEvent = CurationActBase & {
  readonly type: "procedural_label";
  readonly proceduralLabel: ProceduralLabelRule;
};

export type RankWeightCurationActEvent = CurationActBase & {
  readonly type: "rank_weight";
  readonly lensRef: Ref;
  readonly weight: number;
};

export type SummaryCurationActEvent = CurationActBase & {
  readonly type: "summary";
  readonly summaryRef: Ref;
};

export type CurationActEvent =
  | ProceduralLabelCurationActEvent
  | RankWeightCurationActEvent
  | SummaryCurationActEvent;

export type SummaryEvent = {
  readonly summaryId: Ref;
  readonly panelRef: Ref;
  readonly side: BriefingSide;
  readonly extractiveQuotes: readonly string[];
  readonly contestable: true;
};

export type DokimasiaEvent = {
  readonly dokimasiaId: Ref;
  readonly candidateRef: Ref;
  readonly vettingPredicate: string;
  readonly passed: boolean;
};

export type JudgmentEvent = {
  readonly judgmentId: Ref;
  readonly deliberationRef: Ref;
  readonly panelRef: Ref;
  readonly anonymizedAggregate: JsonObject;
  readonly attachedCredence: ProbabilityRange;
  readonly liveDissent: readonly string[];
  readonly twoShot?: {
    readonly t0Ref: Ref;
    readonly t1Ref: Ref;
  };
  readonly decision?: string;
  readonly supportDistribution?: Readonly<Record<string, number>>;
  readonly bridgingMap?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly provenanceRef?: Ref;
};

export type ProvenanceEvent = {
  readonly provenanceId: Ref;
  readonly poolEpochRef: Ref;
  readonly beaconRound: string;
  readonly briefingRefs: readonly Ref[];
  readonly deliberationLogHash: string;
  readonly aggregationMethod: string;
};

export type EuthynaEvent = {
  readonly euthynaId: Ref;
  readonly deliberationRef: Ref;
  readonly processFollowed: boolean;
  readonly interestsDisclosed: boolean;
  readonly findings: readonly string[];
};

export type EventPayloadByType = {
  readonly Identity: IdentityEvent;
  readonly Attestation: AttestationEvent;
  readonly Vouch: VouchEvent;
  readonly Slash: SlashEvent;
  readonly Stratum: StratumEvent;
  readonly PoolEpoch: PoolEpochEvent;
  readonly RandomBeacon: RandomBeaconEvent;
  readonly Draw: DrawEvent;
  readonly AgendaItem: AgendaItemEvent;
  readonly Deliberation: DeliberationEvent;
  readonly Briefing: BriefingEvent;
  readonly Claim: ClaimEvent;
  readonly Rebuttal: RebuttalEvent;
  readonly SuspicionClaim: SuspicionClaimEvent;
  readonly CredenceModel: CredenceModelEvent;
  readonly CredencePrior: CredencePriorEvent;
  readonly CredenceFeatureWeight: CredenceFeatureWeightEvent;
  readonly CredenceEvidenceFamily: CredenceEvidenceFamilyEvent;
  readonly CredenceEvidenceDiscountRule: CredenceEvidenceDiscountRuleEvent;
  readonly Credence: CredenceEvent;
  readonly Lens: LensEvent;
  readonly CurationAct: CurationActEvent;
  readonly Summary: SummaryEvent;
  readonly Dokimasia: DokimasiaEvent;
  readonly Judgment: JudgmentEvent;
  readonly Provenance: ProvenanceEvent;
  readonly Euthyna: EuthynaEvent;
};

export type ProtocolEvent<T extends EventType = EventType> = {
  readonly schemaVersion: ProtocolSchemaVersion;
  readonly type: T;
  readonly payload: EventPayloadByType[T];
};

export type AnyProtocolEvent = {
  readonly [T in EventType]: ProtocolEvent<T>;
}[EventType];

export function event<T extends EventType>(
  type: T,
  payload: EventPayloadByType[T]
): ProtocolEvent<T> {
  return {
    payload,
    schemaVersion: protocolSchemaVersion,
    type
  };
}
