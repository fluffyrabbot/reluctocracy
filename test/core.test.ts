import { describe, expect, it } from "vitest";

import {
  AppendOnlyEventLog,
  auditDrawFairness,
  buildProvenance,
  chronologicalClaimLens,
  contestednessClaimLens,
  deriveTrustFragilityFlagsForDraw,
  drawAlgorithm,
  evaluateInvariants,
  event,
  evaluatePublicDrawRule,
  fingerprintDrawPool,
  hashJson,
  publicHashSortDrawRule,
  rankClaims,
  rankRebuttalsForClaim,
  recomputeDrawPanel,
  renderClaimRebuttalSurface,
  replaySeedSetSensitivity,
  replay,
  replayPublication,
  verifyEventChain,
  type JsonValue,
  type LogRecord,
  type TrustFragilityFlag
} from "../src/index.ts";
import { appendCredenceModelPacket, credenceModelFixture } from "./credence-fixtures.ts";

const signature = {
  publicKey: "ed25519:test-public-key",
  signature: "ed25519:test-signature"
};

type TestPoolMember = {
  readonly identityRef: string;
  readonly trustRank: number;
  readonly strata: readonly string[];
};

describe("append-only event log", () => {
  it("content-addresses events and chains records deterministically", () => {
    const log = new AppendOnlyEventLog();
    const identity = event("Identity", {
      pseudonym: "reluctant-citizen",
      publicKey: "ed25519:alice"
    });

    const record = log.append(identity, signature, {
      appendedAt: "2026-06-14T00:00:00.000Z"
    });

    expect(record.sequence).toBe(0);
    expect(record.previousHash).toBeNull();
    expect(record.eventHash).toBe(hashJson(identity as unknown as JsonValue));
    expect(verifyEventChain(log.records())).toMatchObject({
      headHash: record.recordHash,
      ok: true,
      recordCount: 1
    });
  });

  it("detects mutation against the chain", () => {
    const log = new AppendOnlyEventLog();
    log.append(
      event("Identity", {
        pseudonym: "reluctant-citizen",
        publicKey: "ed25519:alice"
      }),
      signature,
      { appendedAt: "2026-06-14T00:00:00.000Z" }
    );

    const [record] = log.records();
    if (record === undefined) {
      throw new Error("expected one record");
    }

    const tampered = [
      {
        ...record,
        event: event("Identity", {
          pseudonym: "power-seeker",
          publicKey: "ed25519:alice"
        })
      }
    ] satisfies readonly LogRecord[];

    expect(verifyEventChain(tampered)).toMatchObject({
      ok: false
    });
  });
});

describe("deterministic replayed projections", () => {
  it("rebuilds state from the log instead of mutable rows", () => {
    const log = new AppendOnlyEventLog();
    const identityRecord = log.append(
      event("Identity", {
        pseudonym: "reluctant-citizen",
        publicKey: "ed25519:alice"
      }),
      signature,
      { appendedAt: "2026-06-14T00:00:00.000Z" }
    );
    log.append(
      event("AgendaItem", {
        agendaId: "agenda:1",
        challengeWindow: {
          closesAt: "2026-06-16T00:00:00.000Z",
          opensAt: "2026-06-14T00:00:00.000Z"
        },
        contestable: true,
        framing: "Choose a public-interest maintenance budget.",
        proposerRef: identityRecord.eventHash
      }),
      signature,
      { appendedAt: "2026-06-14T00:01:00.000Z" }
    );

    const firstReplay = replay(log.records());
    const secondReplay = replay(log.records());

    expect(firstReplay.source).toEqual(secondReplay.source);
    expect(firstReplay.identities.get(identityRecord.eventHash)).toEqual({
      pseudonym: "reluctant-citizen",
      publicKey: "ed25519:alice"
    });
    expect(firstReplay.agendaItems.get("agenda:1")?.proposerRef).toBe(identityRecord.eventHash);
  });
});

describe("protocol invariants", () => {
  it("recomputes a deterministic diverse Draw from PoolEpoch and RandomBeacon", () => {
    const poolEpoch = {
      members: [
        { identityRef: "identity:a", strata: ["geo:north"], trustRank: 1 },
        { identityRef: "identity:b", strata: ["geo:north"], trustRank: 1 },
        { identityRef: "identity:c", strata: ["geo:south"], trustRank: 1 },
        { identityRef: "identity:d", strata: ["geo:west"], trustRank: 1 }
      ],
      poolEpochId: "pool:deterministic",
      propagationParams: { method: "test-fixture" },
      seedSet: ["seed:test"],
      window: {
        closesAt: "2026-06-15T00:00:00.000Z",
        opensAt: "2026-06-14T00:00:00.000Z"
      }
    };
    const randomBeacon = {
      proof: "proof:test",
      randomness: "beacon:deterministic-fixture",
      round: "round:deterministic"
    };
    const diversityConstraints = {
      algorithm: drawAlgorithm,
      minimumDistinctStrata: 2,
      panelSize: 2
    };

    const first = recomputeDrawPanel({
      diversityConstraints,
      panelSize: 2,
      poolEpoch,
      randomBeacon
    });
    const evaluation = evaluatePublicDrawRule({
      diversityConstraints,
      panelSize: 2,
      poolEpoch,
      randomBeacon
    });
    const second = recomputeDrawPanel({
      diversityConstraints,
      panelSize: 2,
      poolEpoch,
      randomBeacon
    });
    const strataByIdentity = new Map(
      poolEpoch.members.map((member) => [member.identityRef, member.strata])
    );
    const selectedStrata = new Set(first.flatMap((identityRef) => strataByIdentity.get(identityRef) ?? []));

    expect(publicHashSortDrawRule.algorithm).toBe(drawAlgorithm);
    expect(evaluation.selectedPanel).toEqual(first);
    expect(evaluation.poolFingerprint).toBe(fingerprintDrawPool(poolEpoch));
    expect(evaluation.rankedPool).toHaveLength(poolEpoch.members.length);
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(selectedStrata.size).toBeGreaterThanOrEqual(2);

    const independentSeedFork = {
      ...poolEpoch,
      poolEpochId: "pool:deterministic-independent-seed",
      seedSet: ["seed:independent"]
    };
    expect(
      recomputeDrawPanel({
        diversityConstraints,
        panelSize: 2,
        poolEpoch: independentSeedFork,
        randomBeacon
      })
    ).toEqual(first);
  });

  it("audits equal-ticket INV-2 draw fairness over deterministic forked beacons", () => {
    const log = completeJudgmentLog();
    const projection = replay(log.records());
    const draw = projection.draws.get("draw:1");
    const poolEpoch = draw === undefined ? undefined : projection.poolEpochs.get(draw.poolEpochRef);
    if (draw === undefined || poolEpoch === undefined) {
      throw new Error("expected complete fixture to include a draw and pool epoch");
    }

    const audit = auditDrawFairness({
      diversityConstraints: draw.diversityConstraints,
      maxAbsoluteDeviation: 0.08,
      panelSize: draw.selectedPanel.length,
      poolEpoch,
      sampleCount: 1024
    });

    expect(audit.passed).toBe(true);
    expect(new Set(Object.values(audit.expectedSelectionRateByIdentity))).toEqual(new Set([0.5]));
  });

  it("returns machine-checkable results for INV-1..17", () => {
    const log = completeJudgmentLog();
    const results = evaluateInvariants(log.records());

    expect(results).toHaveLength(17);
    expect(results.map((result) => result.id)).toEqual([
      "INV-1",
      "INV-2",
      "INV-3",
      "INV-4",
      "INV-5",
      "INV-6",
      "INV-7",
      "INV-8",
      "INV-9",
      "INV-10",
      "INV-11",
      "INV-12",
      "INV-13",
      "INV-14",
      "INV-15",
      "INV-16",
      "INV-17"
    ]);
    expect(results.filter((result) => result.status === "not_implemented")).toEqual([]);
    expect(results.filter((result) => result.status === "fail")).toEqual([]);
  });

  it("fails INV-3 when panel standing is reused, transferred, or left unexpired", () => {
    const reused = evaluateInvariants(
      completeJudgmentLog({
        duplicateFirstStandingUse: true
      }).records()
    ).find((result) => result.id === "INV-3");
    const transferred = evaluateInvariants(
      completeJudgmentLog({
        transferFirstStandingUseTo: "identity:not-selected"
      }).records()
    ).find((result) => result.id === "INV-3");
    const unexpired = evaluateInvariants(
      completeJudgmentLog({
        omitFirstStandingExpiry: true
      }).records()
    ).find((result) => result.id === "INV-3");

    expect(reused).toMatchObject({
      status: "fail"
    });
    expect(reused?.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("single-use standing")])
    );
    expect(transferred).toMatchObject({
      status: "fail"
    });
    expect(transferred?.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("transfers standing")])
    );
    expect(unexpired).toMatchObject({
      status: "fail"
    });
    expect(unexpired?.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("does not expire on publication")])
    );
  });

  it("fails INV-17 for missing or inconsistent publication provenance", () => {
    const cases = [
      {
        expected: "Provenance provenance:judgment:1 does not resolve",
        log: completeJudgmentLog({ omitProvenance: true })
      },
      {
        expected: "mismatched RandomBeacon",
        log: completeJudgmentLog({ provenanceBeaconRoundOverride: "round:stale" })
      },
      {
        expected: "mismatched PoolEpoch",
        log: completeJudgmentLog({ provenancePoolEpochRefOverride: "pool:1-independent-seed" })
      },
      {
        expected: "briefing set does not match",
        log: completeJudgmentLog({ provenanceBriefingRefsOverride: ["briefing:stale"] })
      }
    ];

    for (const testCase of cases) {
      const inv17 = evaluateInvariants(testCase.log.records()).find((result) => result.id === "INV-17");
      expect(inv17).toMatchObject({ status: "fail" });
      expect(inv17?.failures).toEqual(
        expect.arrayContaining([expect.stringContaining(testCase.expected)])
      );
    }
  });

  it("replays a deeply immutable, fully resolved publication packet", () => {
    const packet = replayPublication(completeJudgmentLog().records(), "judgment:1");

    expect(packet).toMatchObject({
      packetHashAlgorithm: "sha256",
      packetVersion: "reluctocracy.publication.v1"
    });
    expect(packet.provenance.packetHash).toBe(packet.packetHash);
    expect(packet.deliberation.deliberationId).toBe("deliberation:1");
    expect(packet.draw.drawId).toBe("draw:1");
    expect(packet.poolEpoch.poolEpochId).toBe("pool:1");
    expect(packet.randomBeacon.round).toBe("round:1");
    expect(packet.briefings.map((briefing) => briefing.briefingId)).toEqual(["briefing:red"]);
    expect(Object.isFrozen(packet)).toBe(true);
    expect(Object.isFrozen(packet.judgment.anonymizedAggregate)).toBe(true);
    expect(Object.isFrozen(packet.briefings)).toBe(true);
    expect(Object.isFrozen(packet.briefings[0])).toBe(true);
    expect(() => {
      (packet.judgment.anonymizedAggregate as { method: string }).method = "tampered";
    }).toThrow();
    expect(replayPublication(completeJudgmentLog().records(), "judgment:1").packetHash)
      .toBe(packet.packetHash);
  });

  it("rejects publication tampering and invalid event ordering", () => {
    const cases = [
      ["aggregation method", completeJudgmentLog({ provenanceAggregationMethodOverride: "tampered" })],
      ["mismatched deliberation", completeJudgmentLog({ provenanceDeliberationRefOverride: "deliberation:stale" })],
      ["mismatched Draw", completeJudgmentLog({ provenanceDrawRefOverride: "draw:stale" })],
      ["packet hash", completeJudgmentLog({ provenancePacketHashOverride: "sha256:tampered" })],
      ["must precede Judgment", completeJudgmentLog({ provenanceAfterJudgment: true })]
    ] as const;

    for (const [expected, log] of cases) {
      expect(() => replayPublication(log.records(), "judgment:1")).toThrow(expected);
    }
  });

  it("rejects duplicate Provenance and Briefing IDs", () => {
    expect(() => replayPublication(
      completeJudgmentLog({ duplicateProvenanceId: true }).records(),
      "judgment:1"
    )).toThrow("Provenance IDs contain duplicate ID");
    expect(() => replayPublication(
      completeJudgmentLog({ duplicateBriefingId: true }).records(),
      "judgment:1"
    )).toThrow("Briefing IDs contain duplicate ID");
  });

  it("fails INV-2 when an asymmetric diversity constraint skews pool-share odds", () => {
    const log = completeJudgmentLog({
      independentPoolMembers: asymmetricPoolMembers,
      poolMembers: asymmetricPoolMembers
    });
    const inv2 = evaluateInvariants(log.records()).find((result) => result.id === "INV-2");

    expect(inv2).toMatchObject({
      status: "fail"
    });
    expect(inv2?.failures[0]).toContain("observed selection rate");
  });

  it("fails INV-1 when a Judgment panel does not match the recomputed Draw", () => {
    const log = completeJudgmentLog({
      selectedPanelOverride: ["identity:non-member", "identity:alice"]
    });
    const inv1 = evaluateInvariants(log.records()).find((result) => result.id === "INV-1");

    expect(inv1).toMatchObject({
      status: "fail"
    });
    expect(inv1?.failures[0]).toContain("does not match recomputed");
  });

  it("fails INV-11 until unstable independent seed forks are explicitly flagged", () => {
    const unflagged = evaluateInvariants(
      completeJudgmentLog({
        independentPoolMembers: unstableIndependentPoolMembers
      }).records()
    ).find((result) => result.id === "INV-11");

    expect(unflagged).toMatchObject({
      status: "fail"
    });
    expect(unflagged?.failures[0]).toContain("missing trust-fragility flag");

    const flaggedLog = completeJudgmentLog({
      emitTrustFragilityFlags: true,
      independentPoolMembers: unstableIndependentPoolMembers
    });
    const flaggedProjection = replay(flaggedLog.records());
    const flaggedDraw = flaggedProjection.draws.get("draw:1");
    const flagged = evaluateInvariants(flaggedLog.records()).find((result) => result.id === "INV-11");

    expect(flaggedDraw?.trustFragilityFlags?.[0]).toMatchObject({
      comparedPoolEpochRefs: ["pool:1", "pool:1-independent-seed"],
      kind: "pool_seed_instability",
      untrustworthy: true
    });
    expect(flagged).toMatchObject({
      status: "pass"
    });
  });

  it("replays seed-set sensitivity with recomputed pool and draw outcomes", () => {
    const log = completeJudgmentLog({
      independentPoolMembers: unstableIndependentPoolMembers
    });
    const projection = replay(log.records());
    const draw = projection.draws.get("draw:1");
    const basePoolEpoch = projection.poolEpochs.get("pool:1");
    const independentPoolEpoch = projection.poolEpochs.get("pool:1-independent-seed");
    const randomBeacon = projection.randomBeacons.get("round:1");
    if (
      draw === undefined ||
      basePoolEpoch === undefined ||
      independentPoolEpoch === undefined ||
      randomBeacon === undefined
    ) {
      throw new Error("expected complete fixture to include seed sensitivity replay inputs");
    }

    const replayed = replaySeedSetSensitivity({
      basePoolEpoch,
      comparisonPoolEpochs: [independentPoolEpoch],
      draw,
      randomBeacon
    });
    const fork = replayed.forks[0];
    if (fork === undefined) {
      throw new Error("expected one independent seed fork replay");
    }

    expect(replayed.baseSelectedPanel).toEqual(draw.selectedPanel);
    expect(replayed.stable).toBe(false);
    expect(fork.fragile).toBe(true);
    expect(fork.poolOverlap).toBeLessThan(1);
    expect(fork.selectedPanel).toEqual(
      recomputeDrawPanel({
        diversityConstraints: draw.diversityConstraints,
        panelSize: draw.selectedPanel.length,
        poolEpoch: independentPoolEpoch,
        randomBeacon
      })
    );
    expect(replayed.flags).toHaveLength(1);
    expect(replayed.flags[0]).toMatchObject({
      comparedPoolEpochRefs: ["pool:1", "pool:1-independent-seed"],
      independentSeedSets: [["seed:test"], ["seed:independent"]],
      kind: "pool_seed_instability",
      untrustworthy: true
    });
  });

  it("fails INV-11 when no independent seed fork is logged", () => {
    const inv11 = evaluateInvariants(
      completeJudgmentLog({
        emitIndependentPoolEpoch: false
      }).records()
    ).find((result) => result.id === "INV-11");

    expect(inv11).toMatchObject({
      status: "fail"
    });
    expect(inv11?.failures[0]).toContain("no comparable PoolEpoch");
  });

  it("fails INV-11 when a fragility flag does not match replayed evidence", () => {
    const staleFlag = {
      comparedPoolEpochRefs: ["pool:1", "pool:1-independent-seed"],
      independentSeedSets: [["seed:test"], ["seed:independent"]],
      kind: "pool_seed_instability",
      poolOverlap: 1,
      selectedPanelOverlap: 1,
      stabilityThreshold: 1,
      untrustworthy: true
    } satisfies TrustFragilityFlag;
    const inv11 = evaluateInvariants(
      completeJudgmentLog({
        independentPoolMembers: unstableIndependentPoolMembers,
        trustFragilityFlagsOverride: [staleFlag]
      }).records()
    ).find((result) => result.id === "INV-11");

    expect(inv11).toMatchObject({
      status: "fail"
    });
    expect(inv11?.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing trust-fragility flag"),
        expect.stringContaining("stale trust-fragility flag")
      ])
    );
  });

  it("fails INV-15 when a judgment has only one contestable credence model", () => {
    const log = completeJudgmentLog({ singleCredenceModel: true });
    const inv15 = evaluateInvariants(log.records()).find((result) => result.id === "INV-15");

    expect(inv15).toMatchObject({
      status: "fail"
    });
    expect(inv15?.failures[0]).toContain("fewer than two models");
  });

  it("fails implemented briefing and judgment checks on malformed records", () => {
    const log = new AppendOnlyEventLog();
    const malformedBriefing = event("Briefing", {
      authorRef: "expert:1",
      briefingId: "briefing:1",
      fundingDisclosure: "none",
      options: ["only option", "placeholder"],
      side: "red"
    });

    log.append(
      {
        ...malformedBriefing,
        payload: {
          ...malformedBriefing.payload,
          options: ["only option"],
          recommendation: "choose this"
        }
      } as unknown as ReturnType<typeof event<"Briefing">>,
      signature,
      { appendedAt: "2026-06-14T00:00:00.000Z" }
    );

    const failed = evaluateInvariants(log.records()).filter((result) => result.status === "fail");

    expect(failed.map((result) => result.id)).toContain("INV-8");
  });
});

describe("moderation-as-curation seam", () => {
  it("ranks claims through plural legible lenses without a single authoritative feed", () => {
    const log = claimCurationLog();
    const projection = replay(log.records());

    const chronological = rankClaims(chronologicalClaimLens, log.records(), projection);
    const contested = rankClaims(contestednessClaimLens, log.records(), projection);

    expect(chronological.map((item) => item.targetRef)).toEqual(["claim:newer", "claim:older"]);
    expect(chronological[0]?.explanation).toBe("record_appended_at=2026-06-14T00:02:00.000Z");
    expect(contested.map((item) => item.targetRef)).toEqual(["claim:older", "claim:newer"]);
    expect(contested[0]).toMatchObject({
      explanation: "rebuttal_count=2",
      rank: 1,
      score: 2,
      targetRef: "claim:older"
    });
  });

  it("renders claims only with their strongest procedurally ranked rebuttal", () => {
    const log = claimCurationLog();
    const projection = replay(log.records());

    const rebuttals = rankRebuttalsForClaim("claim:older", log.records());
    const surface = renderClaimRebuttalSurface(contestednessClaimLens, log.records(), projection);
    const older = surface.find((item) => item.claim.claimId === "claim:older");
    const surfaceKeys = collectObjectKeys(surface);

    expect(rebuttals.map((item) => item.rebuttal.rebuttalId)).toEqual([
      "rebuttal:stronger",
      "rebuttal:1"
    ]);
    expect(rebuttals[0]).toMatchObject({
      explanation: "basis_ref_count=2; record_appended_at=2026-06-14T00:03:30.000Z",
      rank: 1,
      score: 2
    });
    expect(older?.strongestRebuttal.rebuttal.rebuttalId).toBe("rebuttal:stronger");
    expect(surface.map((item) => item.moderationBoundary)).toEqual([
      "procedural_colocation",
      "procedural_colocation"
    ]);
    expect(surfaceKeys).not.toEqual(
      expect.arrayContaining(["truthVerdict", "truthValue", "expertVerdict", "verdict", "recommendation"])
    );
  });

  it("fails INV-6 when an executable lens would render a claim without a rebuttal", () => {
    const log = new AppendOnlyEventLog();
    log.append(event("Lens", chronologicalClaimLens), signature, {
      appendedAt: "2026-06-14T00:00:00.000Z"
    });
    log.append(
      event("Claim", {
        authorRef: "public:1",
        claimId: "claim:unchallenged",
        claimType: "policy-claim",
        content: "This claim is visible but not renderable yet.",
        role: "public"
      }),
      signature,
      { appendedAt: "2026-06-14T00:01:00.000Z" }
    );

    const inv6 = evaluateInvariants(log.records()).find((result) => result.id === "INV-6");

    expect(inv6).toMatchObject({
      status: "fail"
    });
    expect(inv6?.failures[0]).toContain("Cannot render claim claim:unchallenged without a rebuttal");
  });

  it("accepts procedural labels only as attributed contestable evidence-backed acts", () => {
    const log = claimCurationLog();
    const results = evaluateInvariants(log.records());

    expect(results.find((result) => result.id === "INV-7")).toMatchObject({
      status: "pass"
    });
    expect(results.find((result) => result.id === "INV-9")).toMatchObject({
      status: "pass"
    });
  });

  it("rejects truth-verdict shaped curation and evidence-free procedural labels", () => {
    const log = new AppendOnlyEventLog();
    const malformed = event("CurationAct", {
      authorRef: "curator:1",
      citedRule: "procedural-label:unsupported-assertion",
      contestable: true,
      curationActId: "curation:bad",
      evidenceRefs: ["claim:1"],
      proceduralLabel: "procedural-label:unsupported-assertion",
      rationale: "Unsupported in the cited record.",
      targetRef: "claim:1",
      type: "procedural_label"
    });

    log.append(
      {
        ...malformed,
        payload: {
          ...malformed.payload,
          evidenceRefs: [],
          truthVerdict: "false"
        }
      } as unknown as ReturnType<typeof event<"CurationAct">>,
      signature,
      { appendedAt: "2026-06-14T00:00:00.000Z" }
    );

    const failed = evaluateInvariants(log.records()).filter((result) => result.status === "fail");

    expect(failed.map((result) => result.id)).toEqual(["INV-7", "INV-9"]);
  });
});

const defaultPoolMembers = [
  {
    identityRef: "identity:alice",
    strata: ["geo:coastal", "trade:care"],
    trustRank: 1
  },
  {
    identityRef: "identity:bob",
    strata: ["geo:inland", "trade:water"],
    trustRank: 1
  },
  {
    identityRef: "identity:carol",
    strata: ["geo:coastal", "trade:schools"],
    trustRank: 1
  },
  {
    identityRef: "identity:dora",
    strata: ["geo:inland", "trade:transit"],
    trustRank: 1
  }
] satisfies readonly TestPoolMember[];

const asymmetricPoolMembers = [
  {
    identityRef: "identity:alice",
    strata: ["geo:coastal"],
    trustRank: 1
  },
  {
    identityRef: "identity:bob",
    strata: ["geo:inland"],
    trustRank: 1
  },
  {
    identityRef: "identity:carol",
    strata: ["geo:coastal"],
    trustRank: 1
  },
  {
    identityRef: "identity:dora",
    strata: ["geo:coastal"],
    trustRank: 1
  },
  {
    identityRef: "identity:erin",
    strata: ["geo:coastal"],
    trustRank: 1
  }
] satisfies readonly TestPoolMember[];

const unstableIndependentPoolMembers = [
  {
    identityRef: "identity:alice",
    strata: ["geo:coastal", "trade:care"],
    trustRank: 1
  },
  {
    identityRef: "identity:bob",
    strata: ["geo:inland", "trade:water"],
    trustRank: 1
  },
  {
    identityRef: "identity:carol",
    strata: ["geo:coastal", "trade:schools"],
    trustRank: 1
  },
  {
    identityRef: "identity:erin",
    strata: ["geo:mountain", "trade:energy"],
    trustRank: 1
  }
] satisfies readonly TestPoolMember[];

function completeJudgmentLog(
  options: {
    readonly selectedPanelOverride?: readonly string[];
    readonly singleCredenceModel?: boolean;
    readonly poolMembers?: readonly TestPoolMember[];
    readonly independentPoolMembers?: readonly TestPoolMember[];
    readonly emitTrustFragilityFlags?: boolean;
    readonly emitIndependentPoolEpoch?: boolean;
    readonly trustFragilityFlagsOverride?: readonly TrustFragilityFlag[];
    readonly duplicateFirstStandingUse?: boolean;
    readonly omitFirstStandingExpiry?: boolean;
    readonly transferFirstStandingUseTo?: string;
    readonly omitProvenance?: boolean;
    readonly provenanceBeaconRoundOverride?: string;
    readonly provenancePoolEpochRefOverride?: string;
    readonly provenanceBriefingRefsOverride?: readonly string[];
    readonly provenanceAggregationMethodOverride?: string;
    readonly provenanceDeliberationRefOverride?: string;
    readonly provenanceDrawRefOverride?: string;
    readonly provenancePacketHashOverride?: string;
    readonly provenanceAfterJudgment?: boolean;
    readonly duplicateProvenanceId?: boolean;
    readonly duplicateBriefingId?: boolean;
  } = {}
): AppendOnlyEventLog {
  const log = new AppendOnlyEventLog();

  const identity = log.append(
    event("Identity", {
      pseudonym: "reluctant-citizen",
      publicKey: "ed25519:alice"
    }),
    signature,
    { appendedAt: "2026-06-14T00:00:00.000Z" }
  );

  const poolMembers = options.poolMembers ?? defaultPoolMembers;
  const independentPoolMembers = options.independentPoolMembers ?? poolMembers;
  const poolEpoch = {
    members: poolMembers,
    poolEpochId: "pool:1",
    propagationParams: {
      method: "test-fixture"
    },
    seedSet: ["seed:test"],
    window: {
      closesAt: "2026-06-15T00:00:00.000Z",
      opensAt: "2026-06-14T00:00:00.000Z"
    }
  };
  const independentPoolEpoch = {
    ...poolEpoch,
    members: independentPoolMembers,
    poolEpochId: "pool:1-independent-seed",
    seedSet: ["seed:independent"]
  };
  const randomBeacon = {
    proof: "proof:test",
    randomness: "beacon:test-fixture",
    round: "round:1"
  };
  const diversityConstraints = {
    algorithm: drawAlgorithm,
    minimumDistinctStrata: 2,
    panelSize: 2
  };
  const selectedPanel =
    options.selectedPanelOverride ??
    recomputeDrawPanel({
      diversityConstraints,
      panelSize: 2,
      poolEpoch,
      randomBeacon
    });
  const trustFragilityFlags =
    options.trustFragilityFlagsOverride ??
    (options.emitTrustFragilityFlags
      ? deriveTrustFragilityFlagsForDraw({
        basePoolEpoch: poolEpoch,
        comparisonPoolEpochs: [independentPoolEpoch],
        draw: {
          beaconRound: randomBeacon.round,
          diversityConstraints,
          drawId: "draw:1",
          poolEpochRef: poolEpoch.poolEpochId,
          selectedPanel
        },
        randomBeacon
      })
      : undefined);

  log.append(event("PoolEpoch", poolEpoch), signature, {
    appendedAt: "2026-06-14T00:00:30.000Z"
  });
  if (options.emitIndependentPoolEpoch !== false) {
    log.append(event("PoolEpoch", independentPoolEpoch), signature, {
      appendedAt: "2026-06-14T00:00:35.000Z"
    });
  }
  log.append(event("RandomBeacon", randomBeacon), signature, {
    appendedAt: "2026-06-14T00:00:40.000Z"
  });
  const draw = event("Draw", {
      beaconRound: randomBeacon.round,
      diversityConstraints,
      drawId: "draw:1",
      poolEpochRef: poolEpoch.poolEpochId,
      selectedPanel,
      ...(trustFragilityFlags === undefined
        ? {}
        : { trustFragilityFlags: trustFragilityFlags satisfies readonly TrustFragilityFlag[] })
    }).payload;
  log.append(
    event("Draw", draw),
    signature,
    { appendedAt: "2026-06-14T00:00:50.000Z" }
  );

  log.append(
    event("AgendaItem", {
      agendaId: "agenda:1",
      challengeWindow: {
        closesAt: "2026-06-16T00:00:00.000Z",
        opensAt: "2026-06-14T00:00:00.000Z"
      },
      contestable: true,
      framing: "Choose a maintenance budget.",
      proposerRef: identity.eventHash
    }),
    signature,
    { appendedAt: "2026-06-14T00:01:00.000Z" }
  );

  const deliberation = event("Deliberation", {
      agendaRef: "agenda:1",
      briefingRefs: ["briefing:red"],
      deliberationId: "deliberation:1",
      expertRefs: ["expert:red", "expert:blue"],
      lifecycleState: "SYNTHESIZE",
      panelRef: "draw:1"
    }).payload;
  log.append(
    event("Deliberation", deliberation),
    signature,
    { appendedAt: "2026-06-14T00:01:30.000Z" }
  );

  const briefing = event("Briefing", {
      authorRef: "expert:red",
      briefingId: "briefing:red",
      fundingDisclosure: "none",
      options: ["repair now", "defer one cycle"],
      side: "red"
    }).payload;
  log.append(
    event("Briefing", briefing),
    signature,
    { appendedAt: "2026-06-14T00:02:00.000Z" }
  );

  if (options.duplicateBriefingId === true) {
    log.append(event("Briefing", briefing), signature, {
      appendedAt: "2026-06-14T00:02:05.000Z"
    });
  }

  if (options.provenanceBriefingRefsOverride?.includes("briefing:stale") === true) {
    log.append(
      event("Briefing", {
        authorRef: "expert:blue",
        briefingId: "briefing:stale",
        fundingDisclosure: "none",
        options: ["repair now", "defer one cycle"],
        side: "blue"
      }),
      signature,
      { appendedAt: "2026-06-14T00:02:10.000Z" }
    );
  }

  log.append(
    event("CurationAct", {
      authorRef: "curator:1",
      citedRule: "procedural-label:unsupported-assertion",
      contestable: true,
      curationActId: "curation:1",
      evidenceRefs: ["briefing:red"],
      proceduralLabel: "procedural-label:unsupported-assertion",
      rationale: "Scaffold fixture keeps curation acts evidence-backed and contestable.",
      targetRef: "briefing:red",
      type: "procedural_label"
    }),
    signature,
    { appendedAt: "2026-06-14T00:03:00.000Z" }
  );

  appendStandingLifecycle(log, selectedPanel, options);

  const judgment = event("Judgment", {
    anonymizedAggregate: {
      method: "scaffold-bridging-consensus"
    },
    attachedCredence: {
      lower: 0.1,
      upper: 0.3
    },
    bridgingMap: {
      "repair now": {
        "geo:coastal": 0.7,
        "geo:inland": 0.6
      }
    },
    deliberationRef: "deliberation:1",
    judgmentId: "judgment:1",
    liveDissent: ["defer one cycle retained minority support"],
    panelRef: "draw:1",
    provenanceRef: "provenance:judgment:1",
    supportDistribution: {
      "defer one cycle": 0.35,
      "repair now": 0.65
    },
    twoShot: {
      t0Ref: "claim:t0",
      t1Ref: "claim:t1"
    }
  }).payload;
  const builtProvenance = buildProvenance({
    briefings: [briefing],
    deliberation,
    deliberationLogHash: log.headHash() ?? "",
    draw,
    judgment,
    poolEpoch,
    provenanceId: "provenance:judgment:1",
    randomBeacon
  });
  const provenance = {
    ...builtProvenance,
    ...(options.provenanceAggregationMethodOverride === undefined
      ? {}
      : { aggregationMethod: options.provenanceAggregationMethodOverride }),
    ...(options.provenanceBeaconRoundOverride === undefined
      ? {}
      : { beaconRound: options.provenanceBeaconRoundOverride }),
    ...(options.provenanceBriefingRefsOverride === undefined
      ? {}
      : { briefingRefs: options.provenanceBriefingRefsOverride }),
    ...(options.provenanceDeliberationRefOverride === undefined
      ? {}
      : { deliberationRef: options.provenanceDeliberationRefOverride }),
    ...(options.provenanceDrawRefOverride === undefined
      ? {}
      : { drawRef: options.provenanceDrawRefOverride }),
    ...(options.provenancePacketHashOverride === undefined
      ? {}
      : { packetHash: options.provenancePacketHashOverride }),
    ...(options.provenancePoolEpochRefOverride === undefined
      ? {}
      : { poolEpochRef: options.provenancePoolEpochRefOverride })
  };
  const appendProvenance = (): void => {
    log.append(
      event("Provenance", provenance),
      signature,
      { appendedAt: "2026-06-14T00:03:50.000Z" }
    );
    if (options.duplicateProvenanceId === true) {
      log.append(event("Provenance", provenance), signature, {
        appendedAt: "2026-06-14T00:03:51.000Z"
      });
    }
  };

  if (options.omitProvenance !== true && options.provenanceAfterJudgment !== true) {
    appendProvenance();
  }

  log.append(
    event("Judgment", judgment),
    signature,
    { appendedAt: "2026-06-14T00:04:00.000Z" }
  );
  if (options.omitProvenance !== true && options.provenanceAfterJudgment === true) {
    appendProvenance();
  }

  const baselineCredenceModel = credenceModelFixture("baseline", 0.2, 0.4);
  appendCredenceModelPacket(log, signature, baselineCredenceModel);

  const adversarialCredenceModel = credenceModelFixture("adversarial", 0.25, 0.3);
  if (options.singleCredenceModel !== true) {
    appendCredenceModelPacket(log, signature, adversarialCredenceModel, Date.UTC(2026, 5, 14, 0, 4, 4));
  }
  log.append(
    event("Credence", {
      basis: ["suspicion:none"],
      credenceId: "credence:1",
      featureWeightRefs: ["credence-feature-weight:baseline:t0_t1_shift_synchrony"],
      modelRef: baselineCredenceModel.modelId,
      posterior: {
        lower: 0.1,
        upper: 0.3
      },
      priorRef: baselineCredenceModel.prior.priorId,
      recordedAt: "2026-06-14T00:04:01.000Z",
      targetRef: "judgment:1"
    }),
    signature,
    { appendedAt: "2026-06-14T00:04:07.000Z" }
  );
  if (options.singleCredenceModel !== true) {
    log.append(
      event("Credence", {
        basis: ["suspicion:none"],
        credenceId: "credence:2",
        featureWeightRefs: ["credence-feature-weight:adversarial:position_clustering_anomaly"],
        modelRef: adversarialCredenceModel.modelId,
        posterior: {
          lower: 0.15,
          upper: 0.35
        },
        priorRef: adversarialCredenceModel.prior.priorId,
        recordedAt: "2026-06-14T00:04:08.000Z",
        targetRef: "judgment:1"
      }),
      signature,
      { appendedAt: "2026-06-14T00:04:08.000Z" }
    );
  }

  return log;
}

function appendStandingLifecycle(
  log: AppendOnlyEventLog,
  selectedPanel: readonly string[],
  options: {
    readonly duplicateFirstStandingUse?: boolean;
    readonly omitFirstStandingExpiry?: boolean;
    readonly transferFirstStandingUseTo?: string;
  }
): void {
  selectedPanel.forEach((identityRef, index) => {
    const standingId = `standing:judgment-1:${identityRef}`;
    const isFirst = index === 0;
    const useIdentityRef =
      isFirst && options.transferFirstStandingUseTo !== undefined
        ? options.transferFirstStandingUseTo
        : identityRef;

    log.append(
      event("StandingGrant", {
        basisRef: "draw:1",
        deliberationRef: "deliberation:1",
        expiresAt: "2026-06-14T00:05:00.000Z",
        identityRef,
        issuedAt: "2026-06-14T00:01:45.000Z",
        nonTransferable: true,
        standingId
      }),
      signature,
      { appendedAt: `2026-06-14T00:03:${String(10 + index).padStart(2, "0")}.000Z` }
    );

    log.append(
      event("StandingUse", {
        actionRef: "judgment:1",
        deliberationRef: "deliberation:1",
        identityRef: useIdentityRef,
        purpose: "panel_judgment",
        standingRef: standingId,
        standingUseId: `standing-use:judgment-1:${identityRef}`,
        usedAt: "2026-06-14T00:04:00.000Z"
      }),
      signature,
      { appendedAt: `2026-06-14T00:03:${String(20 + index).padStart(2, "0")}.000Z` }
    );

    if (isFirst && options.duplicateFirstStandingUse === true) {
      log.append(
        event("StandingUse", {
          actionRef: "judgment:1",
          deliberationRef: "deliberation:1",
          identityRef,
          purpose: "panel_judgment",
          standingRef: standingId,
          standingUseId: `standing-use:judgment-1:${identityRef}:duplicate`,
          usedAt: "2026-06-14T00:04:01.000Z"
        }),
        signature,
        { appendedAt: "2026-06-14T00:03:29.000Z" }
      );
    }

    if (isFirst && options.omitFirstStandingExpiry === true) {
      return;
    }

    log.append(
      event("StandingExpiry", {
        deliberationRef: "deliberation:1",
        expiredAt: "2026-06-14T00:04:30.000Z",
        reason: "judgment_published",
        standingExpiryId: `standing-expiry:judgment-1:${identityRef}`,
        standingRef: standingId,
        terminalRef: "judgment:1"
      }),
      signature,
      { appendedAt: `2026-06-14T00:04:${String(30 + index).padStart(2, "0")}.000Z` }
    );
  });
}

function claimCurationLog(): AppendOnlyEventLog {
  const log = new AppendOnlyEventLog();

  log.append(event("Lens", chronologicalClaimLens), signature, {
    appendedAt: "2026-06-14T00:00:00.000Z"
  });
  log.append(event("Lens", contestednessClaimLens), signature, {
    appendedAt: "2026-06-14T00:00:01.000Z"
  });
  log.append(
    event("Claim", {
      authorRef: "public:1",
      claimId: "claim:older",
      claimType: "policy-claim",
      content: "The bridge should be repaired immediately.",
      role: "public"
    }),
    signature,
    { appendedAt: "2026-06-14T00:01:00.000Z" }
  );
  log.append(
    event("Claim", {
      authorRef: "public:2",
      claimId: "claim:newer",
      claimType: "policy-claim",
      content: "The bridge can wait one maintenance cycle.",
      role: "public"
    }),
    signature,
    { appendedAt: "2026-06-14T00:02:00.000Z" }
  );
  log.append(
    event("Rebuttal", {
      basisRefs: ["inspection:fatigue-cracks"],
      content: "Inspection reports cite accelerating fatigue cracks.",
      rebuttalId: "rebuttal:1",
      targetClaimRef: "claim:older"
    }),
    signature,
    { appendedAt: "2026-06-14T00:03:00.000Z" }
  );
  log.append(
    event("Rebuttal", {
      basisRefs: ["inspection:fatigue-cracks", "budget:emergency-repair-window"],
      content: "The current budget window closes before the next inspection cycle.",
      rebuttalId: "rebuttal:stronger",
      targetClaimRef: "claim:older"
    }),
    signature,
    { appendedAt: "2026-06-14T00:03:30.000Z" }
  );
  log.append(
    event("Rebuttal", {
      basisRefs: ["maintenance:cycle-risk"],
      content: "Deferral assumes stable load, but recent traffic counts are above the prior cycle.",
      rebuttalId: "rebuttal:newer",
      targetClaimRef: "claim:newer"
    }),
    signature,
    { appendedAt: "2026-06-14T00:03:45.000Z" }
  );
  log.append(
    event("CurationAct", {
      authorRef: "curator:1",
      citedRule: "procedural-label:unsupported-assertion",
      contestable: true,
      curationActId: "curation:1",
      evidenceRefs: ["claim:newer"],
      proceduralLabel: "procedural-label:unsupported-assertion",
      rationale: "The target claim cites no support in the current record.",
      targetRef: "claim:newer",
      type: "procedural_label"
    }),
    signature,
    { appendedAt: "2026-06-14T00:04:00.000Z" }
  );

  return log;
}

function collectObjectKeys(value: unknown): readonly string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectObjectKeys(item));
  }

  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectObjectKeys(nested)]);
}
