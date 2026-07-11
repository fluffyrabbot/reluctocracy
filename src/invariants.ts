import { validateCurationAct, validateLens } from "./curation.ts";
import {
  auditDrawFairness,
  comparableIndependentSeedForks,
  deriveTrustFragilityFlagsForDraw,
  trustFragilityFlagMatches,
  validateDrawRecomputation
} from "./draw.ts";
import type { LogRecord } from "./log.ts";
import { verifyEventChain } from "./log.ts";
import type { ProjectionState } from "./projections.ts";
import { replay } from "./projections.ts";
import { replayPublication } from "./publication.ts";
import { renderClaimRebuttalSurface } from "./render.ts";

export type InvariantId =
  | "INV-1"
  | "INV-2"
  | "INV-3"
  | "INV-4"
  | "INV-5"
  | "INV-6"
  | "INV-7"
  | "INV-8"
  | "INV-9"
  | "INV-10"
  | "INV-11"
  | "INV-12"
  | "INV-13"
  | "INV-14"
  | "INV-15"
  | "INV-16"
  | "INV-17";

export type InvariantStatus = "fail" | "not_implemented" | "pass";

export type InvariantResult = {
  readonly id: InvariantId;
  readonly name: string;
  readonly status: InvariantStatus;
  readonly source: string;
  readonly obligation: string;
  readonly failures: readonly string[];
};

export type InvariantContext = {
  readonly records: readonly LogRecord[];
  readonly projection: ProjectionState;
};

export type InvariantDefinition = {
  readonly id: InvariantId;
  readonly name: string;
  readonly source: string;
  readonly obligation: string;
  readonly check: (context: InvariantContext) => InvariantResult;
};

export const invariantRegistry = [
  {
    check: checkPanelRecomputability,
    id: "INV-1",
    name: "panel recomputability",
    obligation: "Any Judgment's panel is recomputable from PoolEpoch and RandomBeacon.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkDrawFairness,
    id: "INV-2",
    name: "no selection leverage",
    obligation: "Expected panel share equals pool trust share.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkPerishableStanding,
    id: "INV-3",
    name: "perishable standing",
    obligation: "No identity accrues durable cross-deliberation authority; standing is single-use and non-transferable.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkNoPanelistAttribution,
    id: "INV-4",
    name: "anonymous judgment",
    obligation: "Judgment carries no panelist attribution.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkAppendOnly,
    id: "INV-5",
    name: "append-only projection",
    obligation: "No event is mutated or deleted; state is a projection over the log.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkRenderedClaimsCarryStrongestRebuttal,
    id: "INV-6",
    name: "co-located rebuttal",
    obligation: "A claim cannot be rendered without its strongest rebuttal.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkAttributionAndContestability,
    id: "INV-7",
    name: "attributed contestability",
    obligation: "Every AgendaItem and CurationAct is attributed and contestable.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkBriefings,
    id: "INV-8",
    name: "briefing option discipline",
    obligation: "Every Briefing exposes at least two options and no expert verdict.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkNoTruthVerdict,
    id: "INV-9",
    name: "no truth verdict schema",
    obligation: "No TruthVerdict exists in the schema; only procedural labels with cited rules.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkJudgmentCarriesCredenceAndDissent,
    id: "INV-10",
    name: "unsettled judgment",
    obligation: "Every Judgment ships with a posterior and dissent; none ships as settled.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkSeedSensitivity,
    id: "INV-11",
    name: "seed sensitivity",
    obligation: "Pool is stable across independent seed sets or the result is flagged untrustworthy.",
    source: "PROTOCOL.md §4"
  },
  {
    check: checkTwoShotJudgments,
    id: "INV-12",
    name: "two-shot judgment collection",
    obligation: "Judgments are collected two-shot: independent T0 and deliberated T1; both recorded.",
    source: "AGGREGATION.md §4"
  },
  {
    check: checkNoBareWinner,
    id: "INV-13",
    name: "no bare winner",
    obligation: "No Judgment collapses to a bare winner; distribution, bridging map, and dissent always ship.",
    source: "AGGREGATION.md §4"
  },
  {
    check: checkCredenceRangeAndSeries,
    id: "INV-14",
    name: "credence range time series",
    obligation: "Credence ships as a range, not a point, and as a time series C(t).",
    source: "AGGREGATION.md §4"
  },
  {
    check: checkContestableCredenceModel,
    id: "INV-15",
    name: "contestable credence model",
    obligation: "The credence model, including features, weights, and prior, is open, plural, and contestable.",
    source: "AGGREGATION.md §4"
  },
  {
    check: checkNoDoubleCountedEvidence,
    id: "INV-16",
    name: "no double-counted evidence",
    obligation: "Credence evidence is not double-counted across correlated signals.",
    source: "AGGREGATION.md §4"
  },
  {
    check: checkPublicationProvenance,
    id: "INV-17",
    name: "replayable publication provenance",
    obligation: "Every Judgment resolves a provenance packet matching its deliberation, draw, pool epoch, beacon, and briefing set.",
    source: "PROTOCOL.md §4"
  }
] satisfies readonly InvariantDefinition[];

export function evaluateInvariants(records: readonly LogRecord[]): readonly InvariantResult[] {
  const projection = replay(records);
  const context = { projection, records } satisfies InvariantContext;
  return invariantRegistry.map((definition) => definition.check(context));
}

function pass(definition: InvariantDefinition): InvariantResult {
  return {
    failures: [],
    id: definition.id,
    name: definition.name,
    obligation: definition.obligation,
    source: definition.source,
    status: "pass"
  };
}

function fail(definition: InvariantDefinition, failures: readonly string[]): InvariantResult {
  return {
    failures,
    id: definition.id,
    name: definition.name,
    obligation: definition.obligation,
    source: definition.source,
    status: "fail"
  };
}

function invariantAt(index: number): InvariantDefinition {
  const definition = invariantRegistry[index];
  if (definition === undefined) {
    throw new Error(`Invariant registry missing definition at index ${String(index)}`);
  }
  return definition;
}

function checkPanelRecomputability(context: InvariantContext): InvariantResult {
  const definition = invariantAt(0);
  const failures: string[] = [];

  for (const [judgmentId, judgment] of context.projection.judgments) {
    const draw = context.projection.draws.get(judgment.panelRef);
    if (draw === undefined) {
      failures.push(`${judgmentId}: panelRef ${judgment.panelRef} does not resolve to a Draw`);
      continue;
    }

    const poolEpoch = context.projection.poolEpochs.get(draw.poolEpochRef);
    if (poolEpoch === undefined) {
      failures.push(`${judgmentId}: Draw ${draw.drawId} references missing PoolEpoch ${draw.poolEpochRef}`);
      continue;
    }

    const randomBeacon = context.projection.randomBeacons.get(draw.beaconRound);
    if (randomBeacon === undefined) {
      failures.push(`${judgmentId}: Draw ${draw.drawId} references missing RandomBeacon ${draw.beaconRound}`);
      continue;
    }

    failures.push(
      ...validateDrawRecomputation(draw, poolEpoch, randomBeacon).map(
        (failure) => `${judgmentId}: ${failure}`
      )
    );
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkDrawFairness(context: InvariantContext): InvariantResult {
  const definition = invariantAt(1);
  const failures: string[] = [];

  for (const [drawId, draw] of context.projection.draws) {
    const poolEpoch = context.projection.poolEpochs.get(draw.poolEpochRef);
    if (poolEpoch === undefined) {
      failures.push(`${drawId}: references missing PoolEpoch ${draw.poolEpochRef}`);
      continue;
    }

    try {
      const audit = auditDrawFairness({
        diversityConstraints: draw.diversityConstraints,
        panelSize: draw.selectedPanel.length,
        poolEpoch,
        sampleSalt: `inv-2:${drawId}`
      });
      failures.push(...audit.failures.map((failure) => `${drawId}: ${failure}`));
    } catch (error) {
      failures.push(`${drawId}: ${errorMessage(error)}`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkPerishableStanding(context: InvariantContext): InvariantResult {
  const definition = invariantAt(2);
  const failures: string[] = [];
  const grantsByDeliberationAndIdentity = new Map<string, string[]>();

  for (const [standingId, grant] of context.projection.standingGrants) {
    const rawGrant = grant as unknown as { readonly nonTransferable?: unknown };
    if (rawGrant.nonTransferable !== true) {
      failures.push(`${standingId}: standing grant is transferable`);
    }
    if (grant.identityRef.length === 0 || grant.deliberationRef.length === 0 || grant.basisRef.length === 0) {
      failures.push(`${standingId}: standing grant is missing identity, deliberation, or basis reference`);
    }
    if (compareIso(grant.issuedAt, grant.expiresAt) >= 0) {
      failures.push(`${standingId}: grant expiry must be after issuance`);
    }

    const uses = context.projection.standingUsesByStanding.get(standingId) ?? [];
    const expiries = context.projection.standingExpiriesByStanding.get(standingId) ?? [];

    if (uses.length > 1) {
      failures.push(`${standingId}: standing is used ${String(uses.length)} times`);
    }
    if (expiries.length === 0) {
      failures.push(`${standingId}: standing does not expire at publication`);
    }
    if (expiries.length > 1) {
      failures.push(`${standingId}: standing has ${String(expiries.length)} expiry records`);
    }

    for (const use of uses) {
      if (use.identityRef !== grant.identityRef) {
        failures.push(`${standingId}: use ${use.standingUseId} transfers standing to ${use.identityRef}`);
      }
      if (use.deliberationRef !== grant.deliberationRef) {
        failures.push(`${standingId}: use ${use.standingUseId} crosses into ${use.deliberationRef}`);
      }
      if (compareIso(use.usedAt, grant.issuedAt) < 0 || compareIso(use.usedAt, grant.expiresAt) > 0) {
        failures.push(`${standingId}: use ${use.standingUseId} is outside the standing window`);
      }

      const judgment = context.projection.judgments.get(use.actionRef);
      if (judgment === undefined) {
        failures.push(`${standingId}: use ${use.standingUseId} does not resolve to a Judgment`);
      } else if (judgment.deliberationRef !== grant.deliberationRef) {
        failures.push(`${standingId}: use ${use.standingUseId} resolves to a cross-deliberation Judgment`);
      }
    }

    for (const expiry of expiries) {
      if (expiry.deliberationRef !== grant.deliberationRef) {
        failures.push(`${standingId}: expiry ${expiry.standingExpiryId} crosses into ${expiry.deliberationRef}`);
      }
      if (compareIso(expiry.expiredAt, grant.issuedAt) < 0 || compareIso(expiry.expiredAt, grant.expiresAt) > 0) {
        failures.push(`${standingId}: expiry ${expiry.standingExpiryId} is outside the standing window`);
      }
      if (!uses.some((use) => use.actionRef === expiry.terminalRef)) {
        failures.push(`${standingId}: expiry ${expiry.standingExpiryId} is not tied to the standing use`);
      }
    }

    pushMapValue(
      grantsByDeliberationAndIdentity,
      standingGrantKey(grant.deliberationRef, grant.identityRef),
      standingId
    );
  }

  for (const [standingRef, uses] of context.projection.standingUsesByStanding) {
    if (!context.projection.standingGrants.has(standingRef)) {
      failures.push(`${standingRef}: standing use references missing grant`);
    }
    if (uses.length > 1) {
      failures.push(`${standingRef}: standing use records violate single-use standing`);
    }
  }

  for (const [standingRef] of context.projection.standingExpiriesByStanding) {
    if (!context.projection.standingGrants.has(standingRef)) {
      failures.push(`${standingRef}: standing expiry references missing grant`);
    }
  }

  for (const [judgmentId, judgment] of context.projection.judgments) {
    const draw = context.projection.draws.get(judgment.panelRef);
    if (draw === undefined) {
      continue;
    }

    for (const identityRef of draw.selectedPanel) {
      const grantIds =
        grantsByDeliberationAndIdentity.get(standingGrantKey(judgment.deliberationRef, identityRef)) ?? [];
      const judgmentGrantIds = grantIds.filter((standingId) => {
        const grant = context.projection.standingGrants.get(standingId);
        return grant?.basisRef === draw.drawId;
      });

      if (judgmentGrantIds.length === 0) {
        failures.push(`${judgmentId}: panelist ${identityRef} has no standing grant for this draw`);
        continue;
      }
      if (judgmentGrantIds.length > 1) {
        failures.push(`${judgmentId}: panelist ${identityRef} has duplicate standing grants for this draw`);
      }

      for (const standingId of judgmentGrantIds) {
        const uses = context.projection.standingUsesByStanding.get(standingId) ?? [];
        const expiries = context.projection.standingExpiriesByStanding.get(standingId) ?? [];
        if (!uses.some((use) => use.actionRef === judgmentId && use.identityRef === identityRef)) {
          failures.push(`${judgmentId}: panelist ${identityRef} does not use standing ${standingId}`);
        }
        if (!expiries.some((expiry) => expiry.terminalRef === judgmentId)) {
          failures.push(`${judgmentId}: panelist ${identityRef} standing ${standingId} does not expire on publication`);
        }
      }
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkSeedSensitivity(context: InvariantContext): InvariantResult {
  const definition = invariantAt(10);
  const failures: string[] = [];

  for (const [drawId, draw] of context.projection.draws) {
    const basePoolEpoch = context.projection.poolEpochs.get(draw.poolEpochRef);
    if (basePoolEpoch === undefined) {
      failures.push(`${drawId}: references missing PoolEpoch ${draw.poolEpochRef}`);
      continue;
    }

    const randomBeacon = context.projection.randomBeacons.get(draw.beaconRound);
    if (randomBeacon === undefined) {
      failures.push(`${drawId}: references missing RandomBeacon ${draw.beaconRound}`);
      continue;
    }

    const comparisonPoolEpochs = [...context.projection.poolEpochs.values()].filter((poolEpoch) =>
      comparableIndependentSeedForks(basePoolEpoch, poolEpoch)
    );
    if (comparisonPoolEpochs.length === 0) {
      failures.push(`${drawId}: no comparable PoolEpoch from an independent seed set`);
      continue;
    }

    try {
      const expectedFlags = deriveTrustFragilityFlagsForDraw({
        basePoolEpoch,
        comparisonPoolEpochs,
        draw,
        randomBeacon
      });
      const loggedFlags = draw.trustFragilityFlags ?? [];

      for (const expectedFlag of expectedFlags) {
        if (!loggedFlags.some((flag) => trustFragilityFlagMatches(expectedFlag, flag))) {
          failures.push(
            `${drawId}: missing trust-fragility flag for PoolEpoch fork ${expectedFlag.comparedPoolEpochRefs.join(" -> ")}`
          );
        }
      }

      for (const loggedFlag of loggedFlags) {
        if (!expectedFlags.some((flag) => trustFragilityFlagMatches(flag, loggedFlag))) {
          failures.push(
            `${drawId}: stale trust-fragility flag for PoolEpoch fork ${loggedFlag.comparedPoolEpochRefs.join(" -> ")}`
          );
        }
      }
    } catch (error) {
      failures.push(`${drawId}: ${errorMessage(error)}`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkAppendOnly(context: InvariantContext): InvariantResult {
  const definition = invariantAt(4);
  const verification = verifyEventChain(context.records);
  if (!verification.ok) {
    return fail(definition, verification.failures);
  }

  if (
    context.projection.source.headHash !== verification.headHash ||
    context.projection.source.recordCount !== verification.recordCount
  ) {
    return fail(definition, ["projection source metadata does not match verified log"]);
  }

  return pass(definition);
}

function checkNoPanelistAttribution(context: InvariantContext): InvariantResult {
  const definition = invariantAt(3);
  const failures: string[] = [];
  for (const [judgmentId, judgment] of context.projection.judgments) {
    const raw = judgment as unknown as Record<string, unknown>;
    if ("panelistAttributions" in raw || "panelists" in raw) {
      failures.push(`${judgmentId}: exposes panelist attribution fields`);
    }
  }
  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkRenderedClaimsCarryStrongestRebuttal(context: InvariantContext): InvariantResult {
  const definition = invariantAt(5);
  const failures: string[] = [];

  for (const [lensId, lens] of context.projection.lenses) {
    try {
      const surface = renderClaimRebuttalSurface(lens, context.records, context.projection);
      for (const item of surface) {
        if (item.strongestRebuttal.rank !== 1) {
          failures.push(`${lensId}: claim ${item.claim.claimId} does not carry the strongest rebuttal`);
        }
        if (item.strongestRebuttal.rebuttal.targetClaimRef !== item.claim.claimId) {
          failures.push(`${lensId}: claim ${item.claim.claimId} carries a rebuttal for another claim`);
        }
      }
    } catch (error) {
      failures.push(`${lensId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkAttributionAndContestability(context: InvariantContext): InvariantResult {
  const definition = invariantAt(6);
  const failures: string[] = [];

  for (const [agendaId, agenda] of context.projection.agendaItems) {
    const raw = agenda as unknown as Record<string, unknown>;
    if (agenda.proposerRef.length === 0) {
      failures.push(`${agendaId}: missing proposer attribution`);
    }
    if (raw.contestable !== true) {
      failures.push(`${agendaId}: agenda item is not contestable`);
    }
  }

  for (const [curationActId, curationAct] of context.projection.curationActs) {
    const raw = curationAct as unknown as Record<string, unknown>;
    if (raw.contestable !== true) {
      failures.push(`${curationActId}: curation act is not contestable`);
    }
    failures.push(...validateCurationAct(curationAct));
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkBriefings(context: InvariantContext): InvariantResult {
  const definition = invariantAt(7);
  const failures: string[] = [];

  for (const [briefingId, briefing] of context.projection.briefings) {
    if (briefing.options.length < 2) {
      failures.push(`${briefingId}: has fewer than two options`);
    }

    const raw = briefing as unknown as Record<string, unknown>;
    if ("recommendation" in raw || "expertVerdict" in raw || "verdict" in raw) {
      failures.push(`${briefingId}: contains a prohibited recommendation or verdict field`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkNoTruthVerdict(context: InvariantContext): InvariantResult {
  const definition = invariantAt(8);
  const failures: string[] = [];

  for (const [lensId, lens] of context.projection.lenses) {
    failures.push(...validateLens(lens).map((failure) => `${lensId}: ${failure}`));
  }

  for (const record of context.records) {
    const rawType = (record.event as unknown as { readonly type?: unknown }).type;
    if (rawType === "TruthVerdict") {
      failures.push(`record ${String(record.sequence)}: TruthVerdict is prohibited`);
    }

    if (record.event.type === "CurationAct") {
      const raw = record.event.payload as unknown as Record<string, unknown>;
      if ("truthVerdict" in raw || "truthValue" in raw || "verdict" in raw) {
        failures.push(`record ${String(record.sequence)}: curation act contains a truth-verdict field`);
      }
    }
  }
  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkJudgmentCarriesCredenceAndDissent(context: InvariantContext): InvariantResult {
  const definition = invariantAt(9);
  const failures: string[] = [];

  for (const [judgmentId, judgment] of context.projection.judgments) {
    if (!isProbabilityRange(judgment.attachedCredence)) {
      failures.push(`${judgmentId}: attachedCredence is not a valid range`);
    }
    if (!Array.isArray(judgment.liveDissent)) {
      failures.push(`${judgmentId}: liveDissent is not present`);
    }
    const raw = judgment as unknown as Record<string, unknown>;
    if (raw.settled === true) {
      failures.push(`${judgmentId}: judgment is marked settled`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkTwoShotJudgments(context: InvariantContext): InvariantResult {
  const definition = invariantAt(11);
  const failures: string[] = [];

  for (const [judgmentId, judgment] of context.projection.judgments) {
    const twoShot = judgment.twoShot;
    if (twoShot === undefined || twoShot.t0Ref.length === 0 || twoShot.t1Ref.length === 0) {
      failures.push(`${judgmentId}: missing T0/T1 judgment references`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkNoBareWinner(context: InvariantContext): InvariantResult {
  const definition = invariantAt(12);
  const failures: string[] = [];

  for (const [judgmentId, judgment] of context.projection.judgments) {
    if (judgment.supportDistribution === undefined || Object.keys(judgment.supportDistribution).length === 0) {
      failures.push(`${judgmentId}: missing support distribution`);
    }
    if (judgment.bridgingMap === undefined || Object.keys(judgment.bridgingMap).length === 0) {
      failures.push(`${judgmentId}: missing bridging map`);
    }
    if (judgment.liveDissent.length === 0) {
      failures.push(`${judgmentId}: missing live dissent`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkCredenceRangeAndSeries(context: InvariantContext): InvariantResult {
  const definition = invariantAt(13);
  const failures: string[] = [];

  for (const [judgmentId, judgment] of context.projection.judgments) {
    if (!isProbabilityRange(judgment.attachedCredence)) {
      failures.push(`${judgmentId}: attached credence is not a probability range`);
    }
    const series = context.projection.credencesByTarget.get(judgmentId) ?? [];
    if (series.length === 0) {
      failures.push(`${judgmentId}: no Credence time-series events target this judgment`);
    }
    for (const credence of series) {
      if (!isProbabilityRange(credence.posterior)) {
        failures.push(`${judgmentId}: credence ${credence.credenceId} is not a probability range`);
      }
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkContestableCredenceModel(context: InvariantContext): InvariantResult {
  const definition = invariantAt(14);
  const failures: string[] = [];

  for (const [judgmentId] of context.projection.judgments) {
    const series = context.projection.credencesByTarget.get(judgmentId) ?? [];
    const modelRefs = new Set(series.map((credence) => credence.modelRef));

    if (modelRefs.size < 2) {
      failures.push(`${judgmentId}: credence series references fewer than two models`);
    }

    for (const credence of series) {
      const model = context.projection.credenceModels.get(credence.modelRef);
      if (model === undefined) {
        failures.push(`${judgmentId}: credence ${credence.credenceId} references missing model ${credence.modelRef}`);
        continue;
      }
      if (!hasContestableTrue(model) || model.authorRef.length === 0 || model.rationale.length === 0) {
        failures.push(`${judgmentId}: model ${model.modelId} is not open, attributed, and contestable`);
      }

      const priors = context.projection.credencePriorsByModel.get(model.modelId) ?? [];
      const prior = priors.find((candidate) => candidate.priorId === credence.priorRef);
      if (prior === undefined) {
        failures.push(`${judgmentId}: credence ${credence.credenceId} references missing prior ${credence.priorRef}`);
      } else if (
        !hasContestableTrue(prior) ||
        prior.authorRef.length === 0 ||
        prior.rationale.length === 0 ||
        !isProbability(prior.probability) ||
        prior.bandHalfWidth < 0 ||
        prior.bandHalfWidth > 1
      ) {
        failures.push(`${judgmentId}: prior ${prior.priorId} is not an open contestable probability prior`);
      }

      const weights = context.projection.credenceFeatureWeightsByModel.get(model.modelId) ?? [];
      const weightsById = new Map(weights.map((weight) => [weight.featureWeightId, weight]));
      for (const featureWeightRef of credence.featureWeightRefs) {
        const weight = weightsById.get(featureWeightRef);
        if (weight === undefined) {
          failures.push(`${judgmentId}: credence ${credence.credenceId} references missing feature weight ${featureWeightRef}`);
          continue;
        }
        if (
          !hasContestableTrue(weight) ||
          weight.authorRef.length === 0 ||
          weight.rationale.length === 0 ||
          !isProbability(weight.neutralObservedValue)
        ) {
          failures.push(`${judgmentId}: feature weight ${weight.featureWeightId} is not open, bounded, and contestable`);
        }
      }
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkNoDoubleCountedEvidence(context: InvariantContext): InvariantResult {
  const definition = invariantAt(15);
  const failures: string[] = [];

  for (const [judgmentId] of context.projection.judgments) {
    const series = context.projection.credencesByTarget.get(judgmentId) ?? [];
    for (const credence of series) {
      const weights = context.projection.credenceFeatureWeightsByModel.get(credence.modelRef) ?? [];
      const weightsById = new Map(weights.map((weight) => [weight.featureWeightId, weight]));
      const families = context.projection.credenceEvidenceFamiliesByModel.get(credence.modelRef) ?? [];
      const discountRules = context.projection.credenceEvidenceDiscountRulesByModel.get(credence.modelRef) ?? [];
      const activeWeightsByFamily = new Map<string, Set<string>>();

      for (const family of families) {
        if (
          !hasContestableTrue(family) ||
          family.authorRef.length === 0 ||
          family.rationale.length === 0 ||
          family.featureWeightRefs.length === 0
        ) {
          failures.push(`${judgmentId}: evidence family ${family.evidenceFamilyId} is not open and contestable`);
        }
        for (const featureWeightRef of family.featureWeightRefs) {
          if (!weightsById.has(featureWeightRef)) {
            failures.push(
              `${judgmentId}: evidence family ${family.evidenceFamilyId} references missing feature weight ${featureWeightRef}`
            );
          }
        }
      }

      for (const discountRule of discountRules) {
        if (
          !hasContestableTrue(discountRule) ||
          discountRule.authorRef.length === 0 ||
          discountRule.rationale.length === 0 ||
          !isProbability(discountRule.discountMultiplier)
        ) {
          failures.push(`${judgmentId}: discount rule ${discountRule.discountRuleId} is not open and bounded`);
        }
        if (!families.some((family) => family.evidenceFamilyId === discountRule.evidenceFamilyRef)) {
          failures.push(
            `${judgmentId}: discount rule ${discountRule.discountRuleId} references missing evidence family ${discountRule.evidenceFamilyRef}`
          );
        }
      }

      for (const featureWeightRef of credence.featureWeightRefs) {
        const weight = weightsById.get(featureWeightRef);
        if (weight === undefined) {
          failures.push(`${judgmentId}: credence ${credence.credenceId} references missing feature weight ${featureWeightRef}`);
          continue;
        }

        const familyRefs = families
          .filter((family) => family.featureWeightRefs.includes(featureWeightRef))
          .map((family) => family.evidenceFamilyId);
        if (familyRefs.length === 0) {
          failures.push(`${judgmentId}: feature weight ${featureWeightRef} is not assigned to an evidence family`);
        }
        for (const familyRef of familyRefs) {
          const activeWeights = activeWeightsByFamily.get(familyRef) ?? new Set<string>();
          activeWeights.add(featureWeightRef);
          activeWeightsByFamily.set(familyRef, activeWeights);
        }
      }

      for (const [familyRef, activeWeights] of activeWeightsByFamily) {
        if (activeWeights.size < 2) {
          continue;
        }
        const rules = discountRules.filter((rule) => rule.evidenceFamilyRef === familyRef);
        if (rules.every((rule) => rule.discountMultiplier >= 1)) {
          failures.push(
            `${judgmentId}: evidence family ${familyRef} overlaps ${String(activeWeights.size)} active feature weights without a discount rule`
          );
        }
      }
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function checkPublicationProvenance(context: InvariantContext): InvariantResult {
  const definition = invariantAt(16);
  const failures: string[] = [];
  const referencedProvenanceIds = new Set<string>();

  for (const [judgmentId, judgment] of context.projection.judgments) {
    referencedProvenanceIds.add(judgment.provenanceRef);
    try {
      replayPublication(context.records, judgmentId);
    } catch (error) {
      failures.push(`${judgmentId}: ${errorMessage(error)}`);
    }
  }

  for (const provenanceId of context.projection.provenances.keys()) {
    if (!referencedProvenanceIds.has(provenanceId)) {
      failures.push(`${provenanceId}: Provenance is not referenced by its Judgment`);
    }
  }

  return failures.length > 0 ? fail(definition, failures) : pass(definition);
}

function isProbabilityRange(value: unknown): value is { readonly lower: number; readonly upper: number } {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as { readonly lower?: unknown; readonly upper?: unknown };
  return (
    typeof candidate.lower === "number" &&
    typeof candidate.upper === "number" &&
    candidate.lower >= 0 &&
    candidate.upper <= 1 &&
    candidate.lower <= candidate.upper
  );
}

function hasContestableTrue(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "contestable" in value &&
    value.contestable === true
  );
}

function standingGrantKey(deliberationRef: string, identityRef: string): string {
  return `${deliberationRef}\u0000${identityRef}`;
}

function pushMapValue<Key, Value>(map: Map<Key, Value[]>, key: Key, value: Value): void {
  map.set(key, [...(map.get(key) ?? []), value]);
}

function compareIso(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}
