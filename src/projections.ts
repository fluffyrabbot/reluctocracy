import type {
  AgendaItemEvent,
  AttestationEvent,
  ClaimEvent,
  CredenceEvidenceDiscountRuleEvent,
  CredenceEvidenceFamilyEvent,
  CredenceFeatureWeightEvent,
  CredenceEvent,
  CredenceModelEvent,
  CredencePriorEvent,
  CurationActEvent,
  DeliberationEvent,
  DokimasiaEvent,
  DrawEvent,
  EuthynaEvent,
  IdentityEvent,
  LensEvent,
  PoolEpochEvent,
  ProvenanceEvent,
  RandomBeaconEvent,
  RebuttalEvent,
  SlashEvent,
  StandingExpiryEvent,
  StandingGrantEvent,
  StandingUseEvent,
  StratumEvent,
  SummaryEvent,
  SuspicionClaimEvent,
  VouchEvent,
  BriefingEvent,
  JudgmentEvent,
  Ref
} from "./events.ts";
import type { HexSha256, LogRecord } from "./log.ts";
import { verifyEventChain } from "./log.ts";

export type ProjectionState = {
  readonly source: {
    readonly headHash: HexSha256 | null;
    readonly recordCount: number;
  };
  readonly identities: ReadonlyMap<Ref, IdentityEvent>;
  readonly attestations: ReadonlyMap<Ref, AttestationEvent>;
  readonly vouches: ReadonlyMap<Ref, VouchEvent>;
  readonly slashes: ReadonlyMap<Ref, SlashEvent>;
  readonly standingGrants: ReadonlyMap<Ref, StandingGrantEvent>;
  readonly standingUsesByStanding: ReadonlyMap<Ref, readonly StandingUseEvent[]>;
  readonly standingExpiriesByStanding: ReadonlyMap<Ref, readonly StandingExpiryEvent[]>;
  readonly strataByIdentity: ReadonlyMap<Ref, readonly StratumEvent[]>;
  readonly poolEpochs: ReadonlyMap<Ref, PoolEpochEvent>;
  readonly randomBeacons: ReadonlyMap<string, RandomBeaconEvent>;
  readonly draws: ReadonlyMap<Ref, DrawEvent>;
  readonly agendaItems: ReadonlyMap<Ref, AgendaItemEvent>;
  readonly deliberations: ReadonlyMap<Ref, DeliberationEvent>;
  readonly briefings: ReadonlyMap<Ref, BriefingEvent>;
  readonly claims: ReadonlyMap<Ref, ClaimEvent>;
  readonly rebuttalsByClaim: ReadonlyMap<Ref, readonly RebuttalEvent[]>;
  readonly suspicionClaims: ReadonlyMap<Ref, SuspicionClaimEvent>;
  readonly credenceModels: ReadonlyMap<Ref, CredenceModelEvent>;
  readonly credencePriorsByModel: ReadonlyMap<Ref, readonly CredencePriorEvent[]>;
  readonly credenceFeatureWeightsByModel: ReadonlyMap<Ref, readonly CredenceFeatureWeightEvent[]>;
  readonly credenceEvidenceFamiliesByModel: ReadonlyMap<Ref, readonly CredenceEvidenceFamilyEvent[]>;
  readonly credenceEvidenceDiscountRulesByModel: ReadonlyMap<Ref, readonly CredenceEvidenceDiscountRuleEvent[]>;
  readonly credencesByTarget: ReadonlyMap<Ref, readonly CredenceEvent[]>;
  readonly lenses: ReadonlyMap<Ref, LensEvent>;
  readonly curationActs: ReadonlyMap<Ref, CurationActEvent>;
  readonly summaries: ReadonlyMap<Ref, SummaryEvent>;
  readonly dokimasia: ReadonlyMap<Ref, DokimasiaEvent>;
  readonly judgments: ReadonlyMap<Ref, JudgmentEvent>;
  readonly provenances: ReadonlyMap<Ref, ProvenanceEvent>;
  readonly euthynai: ReadonlyMap<Ref, EuthynaEvent>;
};

type MutableProjectionState = {
  -readonly [Key in keyof Omit<ProjectionState, "source">]: MapProjection<ProjectionState[Key]>;
} & {
  source: ProjectionState["source"];
};

type MapProjection<T> = T extends ReadonlyMap<infer Key, infer Value> ? Map<Key, Value> : never;

export function replay(records: readonly LogRecord[]): ProjectionState {
  const verification = verifyEventChain(records);
  if (!verification.ok) {
    throw new Error(`Cannot replay invalid event chain: ${verification.failures.join("; ")}`);
  }

  const state = emptyMutableState(verification.headHash, verification.recordCount);

  for (const record of records) {
    const event = record.event;
    switch (event.type) {
      case "Identity":
        state.identities.set(record.eventHash, event.payload);
        break;
      case "Attestation":
        state.attestations.set(record.eventHash, event.payload);
        break;
      case "Vouch":
        state.vouches.set(record.eventHash, event.payload);
        break;
      case "Slash":
        state.slashes.set(record.eventHash, event.payload);
        break;
      case "StandingGrant":
        state.standingGrants.set(event.payload.standingId, event.payload);
        break;
      case "StandingUse":
        pushGrouped(state.standingUsesByStanding, event.payload.standingRef, event.payload);
        break;
      case "StandingExpiry":
        pushGrouped(state.standingExpiriesByStanding, event.payload.standingRef, event.payload);
        break;
      case "Stratum":
        pushGrouped(state.strataByIdentity, event.payload.identityRef, event.payload);
        break;
      case "PoolEpoch":
        state.poolEpochs.set(event.payload.poolEpochId, event.payload);
        break;
      case "RandomBeacon":
        state.randomBeacons.set(event.payload.round, event.payload);
        break;
      case "Draw":
        state.draws.set(event.payload.drawId, event.payload);
        break;
      case "AgendaItem":
        state.agendaItems.set(event.payload.agendaId, event.payload);
        break;
      case "Deliberation":
        state.deliberations.set(event.payload.deliberationId, event.payload);
        break;
      case "Briefing":
        state.briefings.set(event.payload.briefingId, event.payload);
        break;
      case "Claim":
        state.claims.set(event.payload.claimId, event.payload);
        break;
      case "Rebuttal":
        pushGrouped(state.rebuttalsByClaim, event.payload.targetClaimRef, event.payload);
        break;
      case "SuspicionClaim":
        state.suspicionClaims.set(event.payload.suspicionClaimId, event.payload);
        break;
      case "CredenceModel":
        state.credenceModels.set(event.payload.modelId, event.payload);
        break;
      case "CredencePrior":
        pushGrouped(state.credencePriorsByModel, event.payload.modelRef, event.payload);
        break;
      case "CredenceFeatureWeight":
        pushGrouped(state.credenceFeatureWeightsByModel, event.payload.modelRef, event.payload);
        break;
      case "CredenceEvidenceFamily":
        pushGrouped(state.credenceEvidenceFamiliesByModel, event.payload.modelRef, event.payload);
        break;
      case "CredenceEvidenceDiscountRule":
        pushGrouped(state.credenceEvidenceDiscountRulesByModel, event.payload.modelRef, event.payload);
        break;
      case "Credence":
        pushGrouped(state.credencesByTarget, event.payload.targetRef, event.payload);
        break;
      case "Lens":
        state.lenses.set(event.payload.lensId, event.payload);
        break;
      case "CurationAct":
        state.curationActs.set(event.payload.curationActId, event.payload);
        break;
      case "Summary":
        state.summaries.set(event.payload.summaryId, event.payload);
        break;
      case "Dokimasia":
        state.dokimasia.set(event.payload.dokimasiaId, event.payload);
        break;
      case "Judgment":
        state.judgments.set(event.payload.judgmentId, event.payload);
        break;
      case "Provenance":
        state.provenances.set(event.payload.provenanceId, event.payload);
        break;
      case "Euthyna":
        state.euthynai.set(event.payload.euthynaId, event.payload);
        break;
    }
  }

  return freezeProjection(state);
}

function emptyMutableState(
  headHash: HexSha256 | null,
  recordCount: number
): MutableProjectionState {
  return {
    agendaItems: new Map(),
    attestations: new Map(),
    briefings: new Map(),
    claims: new Map(),
    credenceFeatureWeightsByModel: new Map(),
    credenceEvidenceDiscountRulesByModel: new Map(),
    credenceEvidenceFamiliesByModel: new Map(),
    credenceModels: new Map(),
    credencePriorsByModel: new Map(),
    credencesByTarget: new Map(),
    curationActs: new Map(),
    deliberations: new Map(),
    dokimasia: new Map(),
    draws: new Map(),
    euthynai: new Map(),
    identities: new Map(),
    judgments: new Map(),
    lenses: new Map(),
    poolEpochs: new Map(),
    provenances: new Map(),
    randomBeacons: new Map(),
    rebuttalsByClaim: new Map(),
    slashes: new Map(),
    standingExpiriesByStanding: new Map(),
    standingGrants: new Map(),
    standingUsesByStanding: new Map(),
    source: {
      headHash,
      recordCount
    },
    strataByIdentity: new Map(),
    summaries: new Map(),
    suspicionClaims: new Map(),
    vouches: new Map()
  };
}

function freezeProjection(state: MutableProjectionState): ProjectionState {
  return {
    agendaItems: freezeMap(state.agendaItems),
    attestations: freezeMap(state.attestations),
    briefings: freezeMap(state.briefings),
    claims: freezeMap(state.claims),
    credenceFeatureWeightsByModel: freezeMap(state.credenceFeatureWeightsByModel),
    credenceEvidenceDiscountRulesByModel: freezeMap(state.credenceEvidenceDiscountRulesByModel),
    credenceEvidenceFamiliesByModel: freezeMap(state.credenceEvidenceFamiliesByModel),
    credenceModels: freezeMap(state.credenceModels),
    credencePriorsByModel: freezeMap(state.credencePriorsByModel),
    credencesByTarget: freezeMap(state.credencesByTarget),
    curationActs: freezeMap(state.curationActs),
    deliberations: freezeMap(state.deliberations),
    dokimasia: freezeMap(state.dokimasia),
    draws: freezeMap(state.draws),
    euthynai: freezeMap(state.euthynai),
    identities: freezeMap(state.identities),
    judgments: freezeMap(state.judgments),
    lenses: freezeMap(state.lenses),
    poolEpochs: freezeMap(state.poolEpochs),
    provenances: freezeMap(state.provenances),
    randomBeacons: freezeMap(state.randomBeacons),
    rebuttalsByClaim: freezeMap(state.rebuttalsByClaim),
    slashes: freezeMap(state.slashes),
    standingExpiriesByStanding: freezeMap(state.standingExpiriesByStanding),
    standingGrants: freezeMap(state.standingGrants),
    standingUsesByStanding: freezeMap(state.standingUsesByStanding),
    source: state.source,
    strataByIdentity: freezeMap(state.strataByIdentity),
    summaries: freezeMap(state.summaries),
    suspicionClaims: freezeMap(state.suspicionClaims),
    vouches: freezeMap(state.vouches)
  };
}

function freezeMap<Key, Value>(map: Map<Key, Value>): ReadonlyMap<Key, Value> {
  return new Map(map);
}

function pushGrouped<Key, Value>(
  map: Map<Key, readonly Value[]>,
  key: Key,
  value: Value
): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}
