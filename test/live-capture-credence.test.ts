import { describe, expect, it } from "vitest";

import {
  evaluateInvariants,
  recomputeDrawPanel,
  replay,
  runLiveCaptureCredenceSimulation,
  type LiveCaptureSimulationInput,
  type SimulatedPanelist
} from "../src/index.ts";
import { credenceModelFixture } from "./credence-fixtures.ts";

const options = ["repair now", "defer one cycle", "replace entirely"] as const;
const credenceModels = [
  credenceModelFixture("baseline", 0.12, 1),
  credenceModelFixture("skeptical", 0.08, 0.65)
] as const;

describe("live capture credence simulation harness", () => {
  it("runs a replayable panel-draw and log-odds credence update with honest placeholders", () => {
    const honest = runLiveCaptureCredenceSimulation(honestScenario());
    const coordinated = runLiveCaptureCredenceSimulation(coordinatedScenario());

    expect(coordinated.draw.selectedPanel).toHaveLength(6);
    expect(coordinated.shiftPatterns.averageShiftMagnitude).toBeGreaterThan(
      honest.shiftPatterns.averageShiftMagnitude
    );
    expect(coordinated.shiftPatterns.dominantShiftEntropy).toBeLessThan(
      honest.shiftPatterns.dominantShiftEntropy
    );
    expect(coordinated.clusteringSignals.averageT1PositionSimilarity).toBeGreaterThan(
      honest.clusteringSignals.averageT1PositionSimilarity
    );
    expect(coordinated.finalPosterior.lower).toBeGreaterThan(honest.finalPosterior.lower);
    expect(coordinated.modelRuns).toHaveLength(2);
    expect(coordinated.evidenceItems.map((item) => item.signal)).toEqual([
      "position_clustering_anomaly",
      "t0_t1_shift_synchrony",
      "stratum_position_decorrelation",
      "surviving_suspicion_claim"
    ]);

    const projection = replay(coordinated.log.records());
    const judgment = projection.judgments.get("judgment:coordinated");
    expect(judgment?.twoShot).toEqual({
      t0Ref: "claim:coordinated:t0-panel-draw",
      t1Ref: "claim:coordinated:t1-panel-draw"
    });
    expect(projection.credencesByTarget.get("judgment:coordinated")).toHaveLength(
      coordinated.modelRuns.reduce((sum, run) => sum + run.updatePipeline.length, 0)
    );
    expect(projection.credenceModels.get("credence-model:baseline")).toMatchObject({
      contestable: true,
      target: "capture_probability"
    });
    expect(projection.credenceModels.get("credence-model:skeptical")).toMatchObject({
      contestable: true,
      target: "capture_probability"
    });
    expect(projection.credencePriorsByModel.get("credence-model:baseline")?.[0]?.priorId).toBe(
      "credence-prior:baseline"
    );
    expect(projection.credenceFeatureWeightsByModel.get("credence-model:baseline")).toHaveLength(4);
    expect(projection.credenceEvidenceFamiliesByModel.get("credence-model:baseline")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceFamilyId: "credence-evidence-family:baseline:position",
          featureWeightRefs: [
            "credence-feature-weight:baseline:position_clustering_anomaly",
            "credence-feature-weight:baseline:stratum_position_decorrelation"
          ]
        })
      ])
    );
    expect(projection.credenceEvidenceDiscountRulesByModel.get("credence-model:baseline")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          discountMultiplier: 0.65,
          evidenceFamilyRef: "credence-evidence-family:baseline:position"
        })
      ])
    );
    expect(
      coordinated.evidenceItems.find((item) => item.signal === "stratum_position_decorrelation")
    ).toMatchObject({
      discountRuleRefs: ["credence-discount:baseline:position"],
      effectiveDiscount: 0.65,
      evidenceFamilyRefs: ["credence-evidence-family:baseline:position"]
    });
    const draw = projection.draws.get(coordinated.draw.drawId);
    const poolEpoch = draw === undefined ? undefined : projection.poolEpochs.get(draw.poolEpochRef);
    const randomBeacon = draw === undefined ? undefined : projection.randomBeacons.get(draw.beaconRound);
    if (draw === undefined || poolEpoch === undefined || randomBeacon === undefined) {
      throw new Error("expected coordinated simulation to emit recomputable draw inputs");
    }
    expect(
      recomputeDrawPanel({
        diversityConstraints: draw.diversityConstraints,
        panelSize: draw.selectedPanel.length,
        poolEpoch,
        randomBeacon
      })
    ).toEqual(coordinated.draw.selectedPanel);

    const invariants = evaluateInvariants(coordinated.log.records());
    const byId = new Map(invariants.map((result) => [result.id, result]));
    expect(byId.get("INV-1")?.status).toBe("pass");
    expect(byId.get("INV-10")?.status).toBe("pass");
    expect(byId.get("INV-12")?.status).toBe("pass");
    expect(byId.get("INV-13")?.status).toBe("pass");
    expect(byId.get("INV-14")?.status).toBe("pass");
    expect(byId.get("INV-15")?.status).toBe("pass");
    expect(byId.get("INV-16")?.status).toBe("pass");
    expect(coordinated.uncalibratedResiduals).toContain(
      "P(E|capture) and P(E|not_capture) parameters are scaffold model weights, not empirical calibration."
    );
  });

  it("fails INV-16 when overlapping evidence families have no discount rule", () => {
    const undiscountedModels = [
      credenceModelFixture("baseline-undiscounted", 0.12, 1, { omitOverlapDiscount: true }),
      credenceModelFixture("skeptical-undiscounted", 0.08, 0.65, { omitOverlapDiscount: true })
    ] as const;
    const coordinated = runLiveCaptureCredenceSimulation(coordinatedScenario(undiscountedModels));
    const inv16 = evaluateInvariants(coordinated.log.records()).find((result) => result.id === "INV-16");

    expect(inv16).toMatchObject({
      status: "fail"
    });
    expect(inv16?.failures[0]).toContain("without a discount rule");
  });
});

function honestScenario(
  models: LiveCaptureSimulationInput["credenceModels"] = credenceModels
): LiveCaptureSimulationInput {
  return {
    beaconRandomness: "beacon:honest-fixture",
    beaconRound: "round:honest",
    options,
    panelSize: 6,
    pool: [
      panelist("identity:h1", ["geo:coastal", "trade:care"], 0.51, 0.31, 0.18, 0.55, 0.27, 0.18),
      panelist("identity:h2", ["geo:inland", "trade:water"], 0.45, 0.4, 0.15, 0.42, 0.42, 0.16),
      panelist("identity:h3", ["geo:coastal", "trade:schools"], 0.35, 0.3, 0.35, 0.39, 0.27, 0.34),
      panelist("identity:h4", ["geo:north", "trade:care"], 0.62, 0.18, 0.2, 0.58, 0.22, 0.2),
      panelist("identity:h5", ["geo:inland", "trade:schools"], 0.28, 0.48, 0.24, 0.31, 0.44, 0.25),
      panelist("identity:h6", ["geo:north", "trade:water"], 0.5, 0.24, 0.26, 0.48, 0.25, 0.27)
    ],
    credenceModels: models,
    scenarioId: "honest"
  };
}

function coordinatedScenario(
  models: LiveCaptureSimulationInput["credenceModels"] = credenceModels
): LiveCaptureSimulationInput {
  return {
    beaconRandomness: "beacon:coordinated-fixture",
    beaconRound: "round:coordinated",
    options,
    panelSize: 6,
    pool: [
      panelist("identity:c1", ["geo:coastal", "trade:care"], 0.35, 0.45, 0.2, 0.82, 0.1, 0.08),
      panelist("identity:c2", ["geo:inland", "trade:water"], 0.32, 0.48, 0.2, 0.8, 0.12, 0.08),
      panelist("identity:c3", ["geo:north", "trade:schools"], 0.34, 0.43, 0.23, 0.79, 0.13, 0.08),
      panelist("identity:c4", ["geo:south", "trade:care"], 0.36, 0.44, 0.2, 0.81, 0.11, 0.08),
      panelist("identity:c5", ["geo:coastal", "trade:water"], 0.33, 0.47, 0.2, 0.8, 0.11, 0.09),
      panelist("identity:c6", ["geo:inland", "trade:schools"], 0.37, 0.42, 0.21, 0.83, 0.09, 0.08)
    ],
    credenceModels: models,
    scenarioId: "coordinated",
    survivingSuspicionClaims: [
      {
        credence: {
          lower: 0.55,
          upper: 0.72
        },
        evidenceAgainst: ["rebuttal:late-disclosure-explained"],
        evidenceFor: ["euthyna:briefing-imbalance"],
        predictIfFalse: "Briefing imbalance should be randomly distributed across options.",
        predictIfTrue: "Late evidence should align with the same option as the synchronized shift.",
        suspicionClaimId: "suspicion:briefing-imbalance"
      }
    ]
  };
}

function panelist(
  identityRef: string,
  strata: readonly string[],
  t0Repair: number,
  t0Defer: number,
  t0Replace: number,
  t1Repair: number,
  t1Defer: number,
  t1Replace: number
): SimulatedPanelist {
  return {
    identityRef,
    pseudonym: identityRef.replace("identity:", "panelist-"),
    publicKey: `ed25519:${identityRef}`,
    strata,
    t0: {
      "defer one cycle": t0Defer,
      "repair now": t0Repair,
      "replace entirely": t0Replace
    },
    t1: {
      "defer one cycle": t1Defer,
      "repair now": t1Repair,
      "replace entirely": t1Replace
    },
    trustRank: 1
  };
}
