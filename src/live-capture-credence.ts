import type { JsonObject, JsonValue } from "./canonical.ts";
import { drawAlgorithm, recomputeDrawPanel } from "./draw.ts";
import type {
  CredenceFeatureName,
  PoolEpochEvent,
  ProbabilityRange,
  RandomBeaconEvent,
  Ref
} from "./events.ts";
import { event } from "./events.ts";
import { AppendOnlyEventLog } from "./log.ts";
import { buildProvenance } from "./publication.ts";

export type OptionScores = Readonly<Record<string, number>>;

export type SimulatedPanelist = {
  readonly identityRef: Ref;
  readonly publicKey: string;
  readonly pseudonym: string;
  readonly strata: readonly string[];
  readonly trustRank: number;
  readonly t0: OptionScores;
  readonly t1: OptionScores;
};

export type PlaceholderSuspicionClaim = {
  readonly suspicionClaimId: Ref;
  readonly predictIfTrue: string;
  readonly predictIfFalse: string;
  readonly evidenceFor: readonly Ref[];
  readonly evidenceAgainst: readonly Ref[];
  readonly credence: ProbabilityRange;
};

export type LiveCaptureCredencePrior = {
  readonly priorId: Ref;
  readonly label: string;
  readonly probability: number;
  readonly bandHalfWidth: number;
  readonly basis: readonly Ref[];
  readonly rationale: string;
};

export type LiveCaptureFeatureWeight = {
  readonly featureWeightId: Ref;
  readonly feature: CredenceFeatureName;
  readonly neutralObservedValue: number;
  readonly logLikelihoodScale: number;
  readonly weight: number;
  readonly basis: readonly Ref[];
  readonly rationale: string;
};

export type LiveCaptureEvidenceFamily = {
  readonly evidenceFamilyId: Ref;
  readonly label: string;
  readonly featureWeightRefs: readonly [Ref, ...Ref[]];
  readonly basis: readonly Ref[];
  readonly rationale: string;
};

export type LiveCaptureEvidenceDiscountRule = {
  readonly discountRuleId: Ref;
  readonly evidenceFamilyRef: Ref;
  readonly discountMultiplier: number;
  readonly basis: readonly Ref[];
  readonly rationale: string;
};

export type LiveCaptureCredenceModel = {
  readonly modelId: Ref;
  readonly label: string;
  readonly version: string;
  readonly authorRef: Ref;
  readonly rationale: string;
  readonly prior: LiveCaptureCredencePrior;
  readonly featureWeights: readonly [
    LiveCaptureFeatureWeight,
    LiveCaptureFeatureWeight,
    ...LiveCaptureFeatureWeight[]
  ];
  readonly evidenceFamilies: readonly [LiveCaptureEvidenceFamily, ...LiveCaptureEvidenceFamily[]];
  readonly discountRules: readonly LiveCaptureEvidenceDiscountRule[];
};

export type LiveCaptureSimulationInput = {
  readonly scenarioId: string;
  readonly options: readonly [string, string, ...string[]];
  readonly pool: readonly SimulatedPanelist[];
  readonly panelSize: number;
  readonly beaconRound: string;
  readonly beaconRandomness: string;
  readonly credenceModels: readonly [
    LiveCaptureCredenceModel,
    LiveCaptureCredenceModel,
    ...LiveCaptureCredenceModel[]
  ];
  readonly survivingSuspicionClaims?: readonly PlaceholderSuspicionClaim[];
};

export type CredenceEvidenceItem = {
  readonly id: string;
  readonly modelRef: Ref;
  readonly featureWeightRef: Ref;
  readonly signal: CredenceFeatureName;
  readonly observed: number;
  readonly modeledLogLikelihoodRatio: number;
  readonly effectiveLogLikelihoodRatio: number;
  readonly evidenceFamilyRefs: readonly Ref[];
  readonly discountRuleRefs: readonly Ref[];
  readonly effectiveDiscount: number;
  readonly caveat: string;
  readonly basisRefs: readonly Ref[];
};

export type CredenceUpdateStep = {
  readonly evidenceId: string;
  readonly priorLogOdds: number;
  readonly logLikelihoodRatio: number;
  readonly posteriorLogOdds: number;
  readonly posteriorPoint: number;
  readonly posteriorRange: ProbabilityRange;
};

export type CredenceModelRun = {
  readonly modelRef: Ref;
  readonly priorRef: Ref;
  readonly featureWeightRefs: readonly [Ref, ...Ref[]];
  readonly evidenceItems: readonly CredenceEvidenceItem[];
  readonly updatePipeline: readonly CredenceUpdateStep[];
  readonly finalPosterior: ProbabilityRange;
};

export type ShiftPatternSummary = {
  readonly byPanelist: readonly {
    readonly identityRef: Ref;
    readonly dominantShift: string;
    readonly magnitude: number;
    readonly from: OptionScores;
    readonly to: OptionScores;
  }[];
  readonly averageShiftMagnitude: number;
  readonly averageShiftDirectionSimilarity: number;
  readonly zeroMovementShare: number;
  readonly dominantShiftEntropy: number;
};

export type ClusteringSignalSummary = {
  readonly averageT1PositionSimilarity: number;
  readonly highlySimilarPositionPairShare: number;
  readonly crossStratumPositionSimilarity: number;
  readonly crossStratumHighlySimilarPairShare: number;
};

export type LiveCaptureSimulationResult = {
  readonly log: AppendOnlyEventLog;
  readonly draw: {
    readonly drawId: Ref;
    readonly selectedPanel: readonly Ref[];
  };
  readonly shiftPatterns: ShiftPatternSummary;
  readonly clusteringSignals: ClusteringSignalSummary;
  readonly modelRuns: readonly [CredenceModelRun, CredenceModelRun, ...CredenceModelRun[]];
  readonly evidenceItems: readonly CredenceEvidenceItem[];
  readonly updatePipeline: readonly CredenceUpdateStep[];
  readonly finalPosterior: ProbabilityRange;
  readonly calibrationStatus: "uncalibrated_model_parameters";
  readonly uncalibratedResiduals: readonly string[];
};

const placeholderSignature = {
  publicKey: "ed25519:simulation-placeholder",
  signature: "ed25519:simulation-placeholder"
};

const baseTimestampMs = Date.UTC(2026, 5, 14, 12, 0, 0);

export function runLiveCaptureCredenceSimulation(
  input: LiveCaptureSimulationInput
): LiveCaptureSimulationResult {
  if (input.pool.length < input.panelSize) {
    throw new Error("panelSize cannot exceed simulated pool size");
  }
  validateCredenceModels(input.credenceModels);

  const log = new AppendOnlyEventLog();
  for (const panelist of input.pool) {
    log.append(
      event("Identity", {
        pseudonym: panelist.pseudonym,
        publicKey: panelist.publicKey
      }),
      placeholderSignature,
      { appendedAt: timestamp(0) }
    );
  }

  const poolEpochId = `pool:${input.scenarioId}`;
  const poolEpoch = {
    members: input.pool.map((panelist) => ({
      identityRef: panelist.identityRef,
      strata: panelist.strata,
      trustRank: panelist.trustRank
    })),
    poolEpochId,
    propagationParams: {
      calibration: "simulation_scaffold",
      method: "simulation-equal-rank-fixture"
    },
    seedSet: ["seed:simulation-scaffold"],
    window: {
      closesAt: "2026-06-15T00:00:00.000Z",
      opensAt: "2026-06-14T00:00:00.000Z"
    }
  } satisfies PoolEpochEvent;
  log.append(
    event("PoolEpoch", poolEpoch),
    placeholderSignature,
    { appendedAt: timestamp(1) }
  );

  const randomBeacon = {
    proof: "simulation-placeholder-proof",
    randomness: input.beaconRandomness,
    round: input.beaconRound
  } satisfies RandomBeaconEvent;
  log.append(
    event("RandomBeacon", randomBeacon),
    placeholderSignature,
    { appendedAt: timestamp(2) }
  );

  const diversityConstraints = {
    algorithm: drawAlgorithm,
    calibration: "simulation_scaffold",
    minimumDistinctStrata: 2,
    panelSize: input.panelSize
  } satisfies JsonObject;
  const selectedPanelRefs = recomputeDrawPanel({
    diversityConstraints,
    panelSize: input.panelSize,
    poolEpoch,
    randomBeacon
  });
  const selectedPanel = resolvePanelists(input.pool, selectedPanelRefs);
  const drawId = `draw:${input.scenarioId}`;
  const draw = event("Draw", {
    beaconRound: input.beaconRound,
    diversityConstraints,
    drawId,
    poolEpochRef: poolEpochId,
    selectedPanel: selectedPanelRefs
  }).payload;
  log.append(
    event("Draw", draw),
    placeholderSignature,
    { appendedAt: timestamp(3) }
  );

  const agendaId = `agenda:${input.scenarioId}`;
  const deliberationId = `deliberation:${input.scenarioId}`;
  const t0ClaimId = `claim:${input.scenarioId}:t0-panel-draw`;
  const t1ClaimId = `claim:${input.scenarioId}:t1-panel-draw`;
  const judgmentId = `judgment:${input.scenarioId}`;
  const redBriefingId = `briefing:${input.scenarioId}:red`;
  const provenanceId = `provenance:${input.scenarioId}`;

  log.append(
    event("AgendaItem", {
      agendaId,
      challengeWindow: {
        closesAt: "2026-06-16T00:00:00.000Z",
        opensAt: "2026-06-14T00:00:00.000Z"
      },
      contestable: true,
      framing: "Simulation fixture for live capture credence over a drafted panel.",
      proposerRef: "identity:simulation-proposer"
    }),
    placeholderSignature,
    { appendedAt: timestamp(4) }
  );

  const deliberation = event("Deliberation", {
    agendaRef: agendaId,
    briefingRefs: [redBriefingId],
    deliberationId,
    expertRefs: ["expert:red-placeholder", "expert:blue-placeholder"],
    lifecycleState: "SYNTHESIZE",
    panelRef: drawId
  }).payload;
  log.append(
    event("Deliberation", deliberation),
    placeholderSignature,
    { appendedAt: timestamp(5) }
  );

  const briefing = event("Briefing", {
    authorRef: "expert:red-placeholder",
    briefingId: redBriefingId,
    fundingDisclosure: "simulation placeholder; no real funding source",
    options: input.options,
    side: "red"
  }).payload;
  log.append(
    event("Briefing", briefing),
    placeholderSignature,
    { appendedAt: timestamp(6) }
  );

  log.append(
    event("Claim", {
      authorRef: "panel:anonymized",
      claimId: t0ClaimId,
      claimType: "simulation.t0_independent_panel_scores",
      content: JSON.stringify(panelScores(selectedPanel, "t0")),
      role: "panelist"
    }),
    placeholderSignature,
    { appendedAt: timestamp(7) }
  );

  log.append(
    event("Claim", {
      authorRef: "panel:anonymized",
      claimId: t1ClaimId,
      claimType: "simulation.t1_deliberated_panel_scores",
      content: JSON.stringify(panelScores(selectedPanel, "t1")),
      role: "panelist"
    }),
    placeholderSignature,
    { appendedAt: timestamp(8) }
  );

  const shiftPatterns = summarizeShiftPatterns(selectedPanel, input.options);
  const clusteringSignals = summarizeClusteringSignals(selectedPanel, input.options);
  const suspicionClaims = input.survivingSuspicionClaims ?? [];
  let timestampOffset = 9;

  for (const suspicionClaim of suspicionClaims) {
    log.append(
      event("SuspicionClaim", {
        credence: suspicionClaim.credence,
        evidenceAgainst: suspicionClaim.evidenceAgainst,
        evidenceFor: suspicionClaim.evidenceFor,
        predictIfFalse: suspicionClaim.predictIfFalse,
        predictIfTrue: suspicionClaim.predictIfTrue,
        suspicionClaimId: suspicionClaim.suspicionClaimId,
        targetRef: deliberationId
      }),
      placeholderSignature,
      { appendedAt: timestamp(timestampOffset) }
    );
    timestampOffset += 1;
  }

  for (const model of input.credenceModels) {
    log.append(
      event("CredenceModel", {
        authorRef: model.authorRef,
        contestable: true,
        label: model.label,
        modelId: model.modelId,
        rationale: model.rationale,
        target: "capture_probability",
        version: model.version
      }),
      placeholderSignature,
      { appendedAt: timestamp(timestampOffset) }
    );
    timestampOffset += 1;

    log.append(
      event("CredencePrior", {
        authorRef: model.authorRef,
        bandHalfWidth: model.prior.bandHalfWidth,
        basis: model.prior.basis,
        contestable: true,
        label: model.prior.label,
        modelRef: model.modelId,
        priorId: model.prior.priorId,
        probability: model.prior.probability,
        rationale: model.prior.rationale
      }),
      placeholderSignature,
      { appendedAt: timestamp(timestampOffset) }
    );
    timestampOffset += 1;

    for (const featureWeight of model.featureWeights) {
      log.append(
        event("CredenceFeatureWeight", {
          authorRef: model.authorRef,
          basis: featureWeight.basis,
          contestable: true,
          feature: featureWeight.feature,
          featureWeightId: featureWeight.featureWeightId,
          logLikelihoodScale: featureWeight.logLikelihoodScale,
          modelRef: model.modelId,
          neutralObservedValue: featureWeight.neutralObservedValue,
          rationale: featureWeight.rationale,
          weight: featureWeight.weight
        }),
        placeholderSignature,
        { appendedAt: timestamp(timestampOffset) }
      );
      timestampOffset += 1;
    }

    for (const evidenceFamily of model.evidenceFamilies) {
      log.append(
        event("CredenceEvidenceFamily", {
          authorRef: model.authorRef,
          basis: evidenceFamily.basis,
          contestable: true,
          evidenceFamilyId: evidenceFamily.evidenceFamilyId,
          featureWeightRefs: evidenceFamily.featureWeightRefs,
          label: evidenceFamily.label,
          modelRef: model.modelId,
          rationale: evidenceFamily.rationale
        }),
        placeholderSignature,
        { appendedAt: timestamp(timestampOffset) }
      );
      timestampOffset += 1;
    }

    for (const discountRule of model.discountRules) {
      log.append(
        event("CredenceEvidenceDiscountRule", {
          authorRef: model.authorRef,
          basis: discountRule.basis,
          contestable: true,
          discountMultiplier: discountRule.discountMultiplier,
          discountRuleId: discountRule.discountRuleId,
          evidenceFamilyRef: discountRule.evidenceFamilyRef,
          modelRef: model.modelId,
          rationale: discountRule.rationale
        }),
        placeholderSignature,
        { appendedAt: timestamp(timestampOffset) }
      );
      timestampOffset += 1;
    }
  }

  const modelRuns = input.credenceModels.map((model) => {
    const evidenceItems = evidenceFromSignals(model, {
      clusteringSignals,
      drawId,
      shiftPatterns,
      suspicionClaims,
      t0ClaimId,
      t1ClaimId
    });
    const updatePipeline = updateLogOddsPipeline(model.prior, evidenceItems);
    const finalStep = updatePipeline.at(-1);
    return {
      evidenceItems,
      featureWeightRefs: model.featureWeights.map((weight) => weight.featureWeightId) as [
        Ref,
        ...Ref[]
      ],
      finalPosterior: finalStep?.posteriorRange ?? priorRange(model.prior),
      modelRef: model.modelId,
      priorRef: model.prior.priorId,
      updatePipeline
    };
  }) as unknown as [CredenceModelRun, CredenceModelRun, ...CredenceModelRun[]];
  const [primaryModelRun] = modelRuns;
  const evidenceItems = primaryModelRun.evidenceItems;
  const updatePipeline = primaryModelRun.updatePipeline;
  const finalPosterior = primaryModelRun.finalPosterior;
  const supportDistribution = averageScores(selectedPanel, input.options, "t1");
  const bridgingMap = buildBridgingMap(selectedPanel, input.options);

  for (const identityRef of selectedPanelRefs) {
    const standingId = `standing:${input.scenarioId}:${identityRef}`;
    log.append(
      event("StandingGrant", {
        basisRef: drawId,
        deliberationRef: deliberationId,
        expiresAt: "2026-06-14T23:59:59.000Z",
        identityRef,
        issuedAt: timestamp(5),
        nonTransferable: true,
        standingId
      }),
      placeholderSignature,
      { appendedAt: timestamp(timestampOffset) }
    );
    timestampOffset += 1;

    log.append(
      event("StandingUse", {
        actionRef: judgmentId,
        deliberationRef: deliberationId,
        identityRef,
        purpose: "panel_judgment",
        standingRef: standingId,
        standingUseId: `standing-use:${input.scenarioId}:${identityRef}`,
        usedAt: timestamp(timestampOffset)
      }),
      placeholderSignature,
      { appendedAt: timestamp(timestampOffset) }
    );
    timestampOffset += 1;
  }

  const judgment = event("Judgment", {
      anonymizedAggregate: {
        calibrationStatus: "uncalibrated_model_parameters",
        clusteringSignals,
        credenceModels: modelRuns.map((run) => ({
          finalPosterior: run.finalPosterior,
          modelRef: run.modelRef,
          priorRef: run.priorRef
        })),
        primaryLogOddsPipeline: updatePipeline as unknown as JsonValue[],
        method: "simulation-only-live-capture-credence-v0",
        panelDraw: {
          drawId,
          selectedPanelSize: selectedPanel.length
        },
        shiftPatterns: shiftPatterns as unknown as JsonObject,
        uncalibratedResiduals: [...residuals()]
      },
      attachedCredence: finalPosterior,
      bridgingMap,
      deliberationRef: deliberationId,
      judgmentId,
      liveDissent: liveDissentFromSupport(supportDistribution),
      panelRef: drawId,
      provenanceRef: provenanceId,
      supportDistribution,
      twoShot: {
        t0Ref: t0ClaimId,
        t1Ref: t1ClaimId
      }
    }).payload;
  const provenance = buildProvenance({
    briefings: [briefing],
    deliberation,
    deliberationLogHash: log.headHash() ?? "",
    draw,
    judgment,
    poolEpoch,
    provenanceId,
    randomBeacon
  });
  log.append(
    event("Provenance", provenance),
    placeholderSignature,
    { appendedAt: timestamp(timestampOffset) }
  );
  timestampOffset += 1;

  log.append(
    event("Judgment", judgment),
    placeholderSignature,
    { appendedAt: timestamp(timestampOffset) }
  );
  timestampOffset += 1;

  for (const identityRef of selectedPanelRefs) {
    const standingId = `standing:${input.scenarioId}:${identityRef}`;
    log.append(
      event("StandingExpiry", {
        deliberationRef: deliberationId,
        expiredAt: timestamp(timestampOffset),
        reason: "judgment_published",
        standingExpiryId: `standing-expiry:${input.scenarioId}:${identityRef}`,
        standingRef: standingId,
        terminalRef: judgmentId
      }),
      placeholderSignature,
      { appendedAt: timestamp(timestampOffset) }
    );
    timestampOffset += 1;
  }

  for (const modelRun of modelRuns) {
    for (const [index, step] of modelRun.updatePipeline.entries()) {
      log.append(
        event("Credence", {
          basis: [step.evidenceId],
          credenceId: `credence:${input.scenarioId}:${modelRun.modelRef}:${String(index + 1)}`,
          featureWeightRefs: modelRun.featureWeightRefs,
          modelRef: modelRun.modelRef,
          posterior: step.posteriorRange,
          priorRef: modelRun.priorRef,
          recordedAt: timestamp(timestampOffset),
          targetRef: judgmentId
        }),
        placeholderSignature,
        { appendedAt: timestamp(timestampOffset) }
      );
      timestampOffset += 1;
    }
  }

  return {
    calibrationStatus: "uncalibrated_model_parameters",
    clusteringSignals,
    draw: {
      drawId,
      selectedPanel: selectedPanelRefs
    },
    evidenceItems,
    finalPosterior,
    log,
    modelRuns,
    shiftPatterns,
    uncalibratedResiduals: residuals(),
    updatePipeline
  };
}

function resolvePanelists(
  pool: readonly SimulatedPanelist[],
  selectedPanelRefs: readonly Ref[]
): readonly SimulatedPanelist[] {
  const byIdentityRef = new Map(pool.map((panelist) => [panelist.identityRef, panelist]));
  return selectedPanelRefs.map((identityRef) => {
    const panelist = byIdentityRef.get(identityRef);
    if (panelist === undefined) {
      throw new Error(`selected panel identityRef ${identityRef} is missing from simulation pool`);
    }
    return panelist;
  });
}

function panelScores(
  panel: readonly SimulatedPanelist[],
  shot: "t0" | "t1"
): readonly JsonObject[] {
  return panel.map((panelist) => ({
    identityRef: panelist.identityRef,
    scores: panelist[shot]
  }));
}

function summarizeShiftPatterns(
  panel: readonly SimulatedPanelist[],
  options: readonly string[]
): ShiftPatternSummary {
  const byPanelist = panel.map((panelist) => {
    const shift = differenceVector(panelist.t0, panelist.t1, options);
    return {
      dominantShift: dominantShift(shift, options),
      from: panelist.t0,
      identityRef: panelist.identityRef,
      magnitude: round(euclideanMagnitude(shift)),
      to: panelist.t1
    };
  });
  const shiftVectors = panel.map((panelist) => differenceVector(panelist.t0, panelist.t1, options));
  const movingShiftVectors = shiftVectors.filter((shift) => euclideanMagnitude(shift) >= 0.03);
  const dominantCounts = countBy(byPanelist.map((panelist) => panelist.dominantShift));

  return {
    averageShiftDirectionSimilarity: round(averagePairwise(movingShiftVectors, cosineSimilarity)),
    averageShiftMagnitude: round(average(shiftVectors.map(euclideanMagnitude))),
    byPanelist,
    dominantShiftEntropy: round(normalizedEntropy(dominantCounts)),
    zeroMovementShare: round(
      shiftVectors.filter((shift) => euclideanMagnitude(shift) < 0.03).length / panel.length
    )
  };
}

function summarizeClusteringSignals(
  panel: readonly SimulatedPanelist[],
  options: readonly string[]
): ClusteringSignalSummary {
  const positionVectors = panel.map((panelist) => scoreVector(panelist.t1, options));
  const pairSimilarities = pairwiseValues(positionVectors, cosineSimilarity);
  const crossStratumSimilarities: number[] = [];

  for (let left = 0; left < panel.length; left += 1) {
    for (let right = left + 1; right < panel.length; right += 1) {
      const leftPanelist = panel[left];
      const rightPanelist = panel[right];
      if (leftPanelist === undefined || rightPanelist === undefined) {
        continue;
      }
      if (!sharesStratum(leftPanelist, rightPanelist)) {
        crossStratumSimilarities.push(
          cosineSimilarity(
            scoreVector(leftPanelist.t1, options),
            scoreVector(rightPanelist.t1, options)
          )
        );
      }
    }
  }

  return {
    averageT1PositionSimilarity: round(average(pairSimilarities)),
    crossStratumHighlySimilarPairShare: round(shareAtLeast(crossStratumSimilarities, 0.95)),
    crossStratumPositionSimilarity: round(average(crossStratumSimilarities)),
    highlySimilarPositionPairShare: round(shareAtLeast(pairSimilarities, 0.95))
  };
}

function evidenceFromSignals(
  model: LiveCaptureCredenceModel,
  input: {
    readonly shiftPatterns: ShiftPatternSummary;
    readonly clusteringSignals: ClusteringSignalSummary;
    readonly suspicionClaims: readonly PlaceholderSuspicionClaim[];
    readonly drawId: Ref;
    readonly t0ClaimId: Ref;
    readonly t1ClaimId: Ref;
  }
): readonly CredenceEvidenceItem[] {
  const { clusteringSignals, drawId, shiftPatterns, suspicionClaims, t0ClaimId, t1ClaimId } = input;
  const shiftSynchrony =
    (1 - shiftPatterns.dominantShiftEntropy) * 0.55 +
    shiftPatterns.averageShiftDirectionSimilarity * 0.35 +
    shiftPatterns.zeroMovementShare * 0.1;
  const positionCluster =
    clusteringSignals.averageT1PositionSimilarity * 0.6 +
    clusteringSignals.highlySimilarPositionPairShare * 0.4;
  const stratumPosition =
    clusteringSignals.crossStratumPositionSimilarity * 0.65 +
    clusteringSignals.crossStratumHighlySimilarPairShare * 0.35;

  return [
    modeledEvidence(model, {
      basisRefs: [t1ClaimId],
      caveat: "Uncalibrated LR: position clustering requires empirical null-model calibration.",
      id: "signal:position-clustering",
      observed: positionCluster,
      signal: "position_clustering_anomaly"
    }),
    modeledEvidence(model, {
      basisRefs: [t0ClaimId, t1ClaimId],
      caveat: "Uncalibrated LR: shift synchrony is not yet calibrated against honest deliberation runs.",
      id: "signal:t0-t1-shift-synchrony",
      observed: shiftSynchrony,
      signal: "t0_t1_shift_synchrony"
    }),
    modeledEvidence(model, {
      basisRefs: [drawId, t1ClaimId],
      caveat: "Uncalibrated LR: cross-stratum position similarity overlaps with clustering and is discounted.",
      id: "signal:stratum-position-decorrelation",
      observed: stratumPosition,
      signal: "stratum_position_decorrelation"
    }),
    ...suspicionClaims.map((claim) =>
      modeledEvidence(model, {
        basisRefs: [claim.suspicionClaimId],
        caveat: "Uncalibrated LR: surviving suspicion claim credence is structured but not empirically calibrated.",
        id: `signal:${claim.suspicionClaimId}`,
        observed: midpoint(claim.credence),
        signal: "surviving_suspicion_claim"
      })
    )
  ];
}

function modeledEvidence(
  model: LiveCaptureCredenceModel,
  input: {
    readonly id: string;
    readonly signal: CredenceFeatureName;
    readonly observed: number;
    readonly caveat: string;
    readonly basisRefs: readonly Ref[];
  }
): CredenceEvidenceItem {
  const featureWeight = featureWeightFor(model, input.signal);
  const evidenceFamilyRefs = evidenceFamilyRefsFor(model, featureWeight.featureWeightId);
  const discountRules = discountRulesFor(model, evidenceFamilyRefs);
  const effectiveDiscount = effectiveDiscountFor(discountRules);
  const modeledLogLikelihoodRatio =
    rescaleToLogLikelihood(
      input.observed,
      featureWeight.neutralObservedValue,
      featureWeight.logLikelihoodScale
    ) * featureWeight.weight;
  return {
    basisRefs: input.basisRefs,
    caveat: input.caveat,
    discountRuleRefs: discountRules.map((rule) => rule.discountRuleId),
    effectiveDiscount,
    effectiveLogLikelihoodRatio: round(modeledLogLikelihoodRatio * effectiveDiscount),
    evidenceFamilyRefs,
    featureWeightRef: featureWeight.featureWeightId,
    id: input.id,
    modelRef: model.modelId,
    modeledLogLikelihoodRatio: round(modeledLogLikelihoodRatio),
    observed: round(input.observed),
    signal: input.signal
  };
}

function validateCredenceModels(
  models: readonly [LiveCaptureCredenceModel, LiveCaptureCredenceModel, ...LiveCaptureCredenceModel[]]
): void {
  const modelIds = new Set<Ref>();
  for (const model of models) {
    if (modelIds.has(model.modelId)) {
      throw new Error(`duplicate credence model id ${model.modelId}`);
    }
    modelIds.add(model.modelId);

    const features = new Set(model.featureWeights.map((weight) => weight.feature));
    for (const required of requiredFeatures) {
      if (!features.has(required)) {
        throw new Error(`credence model ${model.modelId} is missing feature weight ${required}`);
      }
    }

    const featureWeightIds = new Set(model.featureWeights.map((weight) => weight.featureWeightId));
    const familyIds = new Set<Ref>();
    for (const family of model.evidenceFamilies) {
      if (familyIds.has(family.evidenceFamilyId)) {
        throw new Error(`credence model ${model.modelId} has duplicate evidence family ${family.evidenceFamilyId}`);
      }
      familyIds.add(family.evidenceFamilyId);
      for (const featureWeightRef of family.featureWeightRefs) {
        if (!featureWeightIds.has(featureWeightRef)) {
          throw new Error(
            `credence model ${model.modelId} evidence family ${family.evidenceFamilyId} references missing feature weight ${featureWeightRef}`
          );
        }
      }
    }

    const discountRuleIds = new Set<Ref>();
    for (const discountRule of model.discountRules) {
      if (discountRuleIds.has(discountRule.discountRuleId)) {
        throw new Error(`credence model ${model.modelId} has duplicate discount rule ${discountRule.discountRuleId}`);
      }
      discountRuleIds.add(discountRule.discountRuleId);
      if (!familyIds.has(discountRule.evidenceFamilyRef)) {
        throw new Error(
          `credence model ${model.modelId} discount rule ${discountRule.discountRuleId} references missing evidence family ${discountRule.evidenceFamilyRef}`
        );
      }
    }
  }
}

function featureWeightFor(
  model: LiveCaptureCredenceModel,
  feature: CredenceFeatureName
): LiveCaptureFeatureWeight {
  const featureWeight = model.featureWeights.find((weight) => weight.feature === feature);
  if (featureWeight === undefined) {
    throw new Error(`credence model ${model.modelId} is missing feature weight ${feature}`);
  }
  return featureWeight;
}

function evidenceFamilyRefsFor(
  model: LiveCaptureCredenceModel,
  featureWeightRef: Ref
): readonly Ref[] {
  return model.evidenceFamilies
    .filter((family) => family.featureWeightRefs.includes(featureWeightRef))
    .map((family) => family.evidenceFamilyId);
}

function discountRulesFor(
  model: LiveCaptureCredenceModel,
  evidenceFamilyRefs: readonly Ref[]
): readonly LiveCaptureEvidenceDiscountRule[] {
  const familyRefSet = new Set(evidenceFamilyRefs);
  return model.discountRules.filter((rule) => familyRefSet.has(rule.evidenceFamilyRef));
}

function effectiveDiscountFor(discountRules: readonly LiveCaptureEvidenceDiscountRule[]): number {
  return round(
    discountRules.reduce(
      (discount, rule) => discount * clamp(rule.discountMultiplier, 0, 1),
      1
    )
  );
}

const requiredFeatures = [
  "position_clustering_anomaly",
  "t0_t1_shift_synchrony",
  "stratum_position_decorrelation",
  "surviving_suspicion_claim"
] satisfies readonly CredenceFeatureName[];

function updateLogOddsPipeline(
  prior: LiveCaptureCredencePrior,
  evidenceItems: readonly CredenceEvidenceItem[]
): readonly CredenceUpdateStep[] {
  let currentLogOdds = logit(prior.probability);
  return evidenceItems.map((item, index) => {
    const nextLogOdds = currentLogOdds + item.effectiveLogLikelihoodRatio;
    const posteriorPoint = logistic(nextLogOdds);
    const step = {
      evidenceId: item.id,
      logLikelihoodRatio: item.effectiveLogLikelihoodRatio,
      posteriorLogOdds: round(nextLogOdds),
      posteriorPoint: round(posteriorPoint),
      posteriorRange: uncertaintyBand(posteriorPoint, prior.bandHalfWidth + index * 0.015),
      priorLogOdds: round(currentLogOdds)
    };
    currentLogOdds = nextLogOdds;
    return step;
  });
}

function averageScores(
  panel: readonly SimulatedPanelist[],
  options: readonly string[],
  shot: "t0" | "t1"
): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const option of options) {
    distribution[option] = round(average(panel.map((panelist) => panelist[shot][option] ?? 0)));
  }
  return distribution;
}

function buildBridgingMap(
  panel: readonly SimulatedPanelist[],
  options: readonly string[]
): Record<string, Record<string, number>> {
  const strata = [...new Set(panel.flatMap((panelist) => panelist.strata))].sort();
  const map: Record<string, Record<string, number>> = {};
  for (const option of options) {
    map[option] = {};
    for (const stratum of strata) {
      const members = panel.filter((panelist) => panelist.strata.includes(stratum));
      map[option][stratum] = round(average(members.map((panelist) => panelist.t1[option] ?? 0)));
    }
  }
  return map;
}

function liveDissentFromSupport(supportDistribution: Record<string, number>): readonly string[] {
  const entries = Object.entries(supportDistribution).sort((left, right) => right[1] - left[1]);
  const [winner] = entries;
  const dissent = entries
    .filter(([option, support]) => option !== winner?.[0] && support >= 0.15)
    .map(([option, support]) => `${option} retained ${String(round(support))} support`);
  if (dissent.length > 0) {
    return dissent;
  }
  const strongestNonWinner = entries.find(([option]) => option !== winner?.[0]);
  return strongestNonWinner === undefined
    ? ["no alternative option was available to express dissent"]
    : [`${strongestNonWinner[0]} was the strongest recorded dissent at ${String(round(strongestNonWinner[1]))} support`];
}

function scoreVector(scores: OptionScores, options: readonly string[]): readonly number[] {
  return options.map((option) => scores[option] ?? 0);
}

function differenceVector(
  before: OptionScores,
  after: OptionScores,
  options: readonly string[]
): readonly number[] {
  return options.map((option) => (after[option] ?? 0) - (before[option] ?? 0));
}

function dominantShift(shift: readonly number[], options: readonly string[]): string {
  let bestIndex = 0;
  let bestMagnitude = Number.NEGATIVE_INFINITY;
  for (const [index, value] of shift.entries()) {
    if (Math.abs(value) > bestMagnitude) {
      bestIndex = index;
      bestMagnitude = Math.abs(value);
    }
  }
  const option = options[bestIndex] ?? "unknown";
  const direction = (shift[bestIndex] ?? 0) >= 0 ? "toward" : "away";
  return `${direction}:${option}`;
}

function sharesStratum(left: SimulatedPanelist, right: SimulatedPanelist): boolean {
  return left.strata.some((stratum) => right.strata.includes(stratum));
}

function pairwiseValues<T>(
  values: readonly T[],
  measure: (left: T, right: T) => number
): readonly number[] {
  const measured: number[] = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const leftValue = values[left];
      const rightValue = values[right];
      if (leftValue !== undefined && rightValue !== undefined) {
        measured.push(measure(leftValue, rightValue));
      }
    }
  }
  return measured;
}

function averagePairwise(
  values: readonly (readonly number[])[],
  measure: (left: readonly number[], right: readonly number[]) => number
): number {
  return average(pairwiseValues(values, measure));
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const numerator = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const leftMagnitude = euclideanMagnitude(left);
  const rightMagnitude = euclideanMagnitude(right);
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return numerator / (leftMagnitude * rightMagnitude);
}

function euclideanMagnitude(values: readonly number[]): number {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

function shareAtLeast(values: readonly number[], threshold: number): number {
  if (values.length === 0) {
    return 0;
  }
  return values.filter((value) => value >= threshold).length / values.length;
}

function countBy(values: readonly string[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function normalizedEntropy(counts: ReadonlyMap<string, number>): number {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0 || counts.size <= 1) {
    return 0;
  }
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / total;
    return sum - probability * Math.log2(probability);
  }, 0);
  return entropy / Math.log2(counts.size);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rescaleToLogLikelihood(observed: number, neutral: number, scale: number): number {
  return clamp((observed - neutral) * scale, -1.2, 1.8);
}

function priorRange(prior: LiveCaptureCredencePrior): ProbabilityRange {
  return uncertaintyBand(prior.probability, prior.bandHalfWidth);
}

function uncertaintyBand(point: number, halfWidth: number): ProbabilityRange {
  return {
    lower: round(clamp(point - halfWidth, 0.001, 0.999)),
    upper: round(clamp(point + halfWidth, 0.001, 0.999))
  };
}

function logit(probability: number): number {
  return Math.log(probability / (1 - probability));
}

function logistic(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

function midpoint(range: ProbabilityRange): number {
  return (range.lower + range.upper) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function timestamp(offsetMinutes: number): string {
  return new Date(baseTimestampMs + offsetMinutes * 60_000).toISOString();
}

function residuals(): readonly string[] {
  return [
    "P(E|capture) and P(E|not_capture) parameters are scaffold model weights, not empirical calibration.",
    "The evidence-family discount rules are heuristic overlap controls, not covariance-modeled.",
    "The simulated panel draw is deterministic test data, not a production selection algorithm.",
    "SuspicionClaim likelihood contribution depends on contestable model weights rather than a calibrated elicitation process."
  ];
}
