import {
  event,
  type AppendOnlyEventLog,
  type LiveCaptureCredenceModel,
  type SignatureBundle
} from "../src/index.ts";

export type CredenceModelFixtureOptions = {
  readonly omitOverlapDiscount?: boolean;
};

export function credenceModelFixture(
  suffix: string,
  priorProbability: number,
  weightMultiplier: number,
  options: CredenceModelFixtureOptions = {}
): LiveCaptureCredenceModel {
  return {
    authorRef: `curator:${suffix}`,
    discountRules: [
      ...(options.omitOverlapDiscount === true
        ? []
        : [
            {
              basis: ["calibration-note:position-correlation"],
              discountMultiplier: 0.65,
              discountRuleId: `credence-discount:${suffix}:position`,
              evidenceFamilyRef: `credence-evidence-family:${suffix}:position`,
              rationale: "Position clustering and stratum decorrelation overlap, so the family is discounted."
            }
          ]),
      {
        basis: ["calibration-note:shift-correlation"],
        discountMultiplier: 1,
        discountRuleId: `credence-discount:${suffix}:shift`,
        evidenceFamilyRef: `credence-evidence-family:${suffix}:shift`,
        rationale: "Shift synchrony is independent in this fixture."
      },
      {
        basis: ["calibration-note:suspicion-correlation"],
        discountMultiplier: 1,
        discountRuleId: `credence-discount:${suffix}:suspicion`,
        evidenceFamilyRef: `credence-evidence-family:${suffix}:suspicion`,
        rationale: "Surviving suspicion claims are their own family in this fixture."
      }
    ],
    evidenceFamilies: [
      {
        basis: ["calibration-note:position-correlation"],
        evidenceFamilyId: `credence-evidence-family:${suffix}:position`,
        featureWeightRefs: [
          `credence-feature-weight:${suffix}:position_clustering_anomaly`,
          `credence-feature-weight:${suffix}:stratum_position_decorrelation`
        ],
        label: "Position correlation",
        rationale: "Position-like signals overlap and need a shared discount."
      },
      {
        basis: ["calibration-note:shift-correlation"],
        evidenceFamilyId: `credence-evidence-family:${suffix}:shift`,
        featureWeightRefs: [`credence-feature-weight:${suffix}:t0_t1_shift_synchrony`],
        label: "Shift synchrony",
        rationale: "Shift synchrony is tracked separately from position clustering."
      },
      {
        basis: ["calibration-note:suspicion-correlation"],
        evidenceFamilyId: `credence-evidence-family:${suffix}:suspicion`,
        featureWeightRefs: [`credence-feature-weight:${suffix}:surviving_suspicion_claim`],
        label: "Suspicion claims",
        rationale: "Surviving suspicion claims are grouped separately."
      }
    ],
    featureWeights: [
      featureWeight(suffix, "position_clustering_anomaly", 0.55, 2, weightMultiplier),
      featureWeight(suffix, "t0_t1_shift_synchrony", 0.45, 2.2, weightMultiplier),
      featureWeight(suffix, "stratum_position_decorrelation", 0.5, 1.6, weightMultiplier),
      featureWeight(suffix, "surviving_suspicion_claim", 0.5, 1.1, weightMultiplier)
    ],
    label: `${suffix} capture model`,
    modelId: `credence-model:${suffix}`,
    prior: {
      bandHalfWidth: 0.04,
      basis: ["calibration-note:simulation-scaffold"],
      label: `${suffix} capture base rate`,
      priorId: `credence-prior:${suffix}`,
      probability: priorProbability,
      rationale: "Fixture prior kept explicit so competing priors can be challenged in the log."
    },
    rationale: "Fixture model exposes each feature weight as a contestable event.",
    version: "simulation-v0"
  };
}

export function appendCredenceModelPacket(
  log: AppendOnlyEventLog,
  signature: SignatureBundle,
  model: LiveCaptureCredenceModel,
  startMs = Date.UTC(2026, 5, 14, 0, 4, 1)
): void {
  let offset = 0;
  const nextTimestamp = (): string => {
    const value = new Date(startMs + offset * 250).toISOString();
    offset += 1;
    return value;
  };

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
    signature,
    { appendedAt: nextTimestamp() }
  );

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
    signature,
    { appendedAt: nextTimestamp() }
  );

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
      signature,
      { appendedAt: nextTimestamp() }
    );
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
      signature,
      { appendedAt: nextTimestamp() }
    );
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
      signature,
      { appendedAt: nextTimestamp() }
    );
  }
}

function featureWeight(
  modelSuffix: string,
  feature: LiveCaptureCredenceModel["featureWeights"][number]["feature"],
  neutralObservedValue: number,
  logLikelihoodScale: number,
  weight: number
): LiveCaptureCredenceModel["featureWeights"][number] {
  return {
    basis: [`calibration-note:${feature}`],
    feature,
    featureWeightId: `credence-feature-weight:${modelSuffix}:${feature}`,
    logLikelihoodScale,
    neutralObservedValue,
    rationale: "Simulation weight is explicit and contestable; empirical calibration remains residual.",
    weight
  };
}
