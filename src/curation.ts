import type {
  ClaimEvent,
  CurationActEvent,
  LensEvent,
  LensRule,
  ProceduralLabelRule,
  Ref
} from "./events.ts";
import type { HexSha256, LogRecord } from "./log.ts";
import type { ProjectionState } from "./projections.ts";

export const chronologicalClaimLens = {
  description: "Claims ordered only by log append time, with event hash as a stable tie-breaker.",
  lensId: "lens:claims:chronological:newest",
  name: "Chronological claims",
  rule: {
    direction: "newest_first",
    kind: "chronological",
    tieBreaker: "event_hash_asc",
    timestamp: "record_appended_at"
  },
  target: "claim"
} satisfies LensEvent;

export const contestednessClaimLens = {
  description: "Claims with more rebuttals surface first; no truth verdict is inferred.",
  lensId: "lens:claims:contestedness:most",
  name: "Most contested claims",
  rule: {
    direction: "most_contested_first",
    kind: "contestedness",
    signal: "rebuttal_count",
    tieBreaker: "event_hash_asc"
  },
  target: "claim"
} satisfies LensEvent;

export const proceduralLabelRules = {
  "procedural-label:ad-hominem": {
    description: "Flags an attack on a participant rather than a claim, without evaluating truth.",
    requiresEvidence: true
  },
  "procedural-label:duplicate": {
    description: "Flags that the target repeats a cited prior claim, without suppressing either entry.",
    requiresEvidence: true
  },
  "procedural-label:unsupported-assertion": {
    description: "Flags that the target claim cites no support in the record, without declaring it false.",
    requiresEvidence: true
  }
} satisfies Record<ProceduralLabelRule, { readonly description: string; readonly requiresEvidence: true }>;

export type RankedLensItem = {
  readonly targetRef: Ref;
  readonly rank: number;
  readonly score: number;
  readonly explanation: string;
};

type ClaimCandidate = {
  readonly claim: ClaimEvent;
  readonly appendedAt: string;
  readonly eventHash: HexSha256;
};

export function rankClaims(
  lens: LensEvent,
  records: readonly LogRecord[],
  projection: ProjectionState
): readonly RankedLensItem[] {
  const failures = validateLens(lens);
  if (failures.length > 0) {
    throw new Error(`Cannot rank with invalid Lens ${lens.lensId}: ${failures.join("; ")}`);
  }

  const candidates = claimCandidates(records);
  const scored = candidates.map((candidate) =>
    scoreClaim(candidate, lens.rule, projection)
  );

  return scored
    .toSorted((left, right) => compareRanked(left, right, lens.rule))
    .map((item, index) => ({
      explanation: item.explanation,
      rank: index + 1,
      score: item.score,
      targetRef: item.targetRef
    }));
}

export function validateLens(lens: LensEvent): readonly string[] {
  const failures: string[] = [];
  const rawLens = lens as unknown as Record<string, unknown>;
  const rawRule = rawLens.rule as Record<string, unknown> | undefined;

  if (lens.lensId.length === 0) {
    failures.push("lensId is required");
  }
  if (lens.name.length === 0) {
    failures.push(`${lens.lensId}: name is required`);
  }
  if (lens.description.length === 0) {
    failures.push(`${lens.lensId}: description is required for legibility`);
  }
  if (rawLens.target !== "claim") {
    failures.push(`${lens.lensId}: only claim lenses are executable in this seam`);
  }

  switch (lens.rule.kind) {
    case "chronological":
      if (rawRule?.timestamp !== "record_appended_at") {
        failures.push(`${lens.lensId}: chronological lenses must use record_appended_at`);
      }
      if (rawRule?.tieBreaker !== "event_hash_asc") {
        failures.push(`${lens.lensId}: unsupported tie-breaker`);
      }
      break;
    case "contestedness":
      if (rawRule?.signal !== "rebuttal_count") {
        failures.push(`${lens.lensId}: contestedness lenses must use rebuttal_count`);
      }
      if (rawRule?.tieBreaker !== "event_hash_asc") {
        failures.push(`${lens.lensId}: unsupported tie-breaker`);
      }
      break;
  }

  return failures;
}

export function validateCurationAct(act: CurationActEvent): readonly string[] {
  const failures: string[] = [];

  if (act.authorRef.length === 0) {
    failures.push(`${act.curationActId}: missing author attribution`);
  }
  if (act.targetRef.length === 0) {
    failures.push(`${act.curationActId}: missing targetRef`);
  }
  if (act.citedRule.length === 0) {
    failures.push(`${act.curationActId}: missing cited procedural rule`);
  }
  if (act.evidenceRefs.length === 0) {
    failures.push(`${act.curationActId}: missing evidenceRefs`);
  }
  if (act.rationale.length === 0) {
    failures.push(`${act.curationActId}: missing rationale`);
  }

  switch (act.type) {
    case "procedural_label":
      if (!(act.proceduralLabel in proceduralLabelRules)) {
        failures.push(`${act.curationActId}: unsupported procedural label`);
      }
      if (act.citedRule !== act.proceduralLabel) {
        failures.push(`${act.curationActId}: citedRule must match proceduralLabel`);
      }
      break;
    case "rank_weight":
      if (act.lensRef.length === 0) {
        failures.push(`${act.curationActId}: rank_weight act must cite a lensRef`);
      }
      if (!Number.isFinite(act.weight)) {
        failures.push(`${act.curationActId}: rank_weight must be finite`);
      }
      break;
    case "summary":
      if (act.summaryRef.length === 0) {
        failures.push(`${act.curationActId}: summary act must cite a summaryRef`);
      }
      break;
  }

  return failures;
}

type ScoredClaim = {
  readonly explanation: string;
  readonly eventHash: HexSha256;
  readonly score: number;
  readonly targetRef: Ref;
};

function claimCandidates(records: readonly LogRecord[]): readonly ClaimCandidate[] {
  return records.flatMap((record) => {
    if (record.event.type !== "Claim") {
      return [];
    }

    return [
      {
        appendedAt: record.appendedAt,
        claim: record.event.payload,
        eventHash: record.eventHash
      }
    ];
  });
}

function scoreClaim(
  candidate: ClaimCandidate,
  rule: LensRule,
  projection: ProjectionState
): ScoredClaim {
  switch (rule.kind) {
    case "chronological": {
      const score = Date.parse(candidate.appendedAt);
      return {
        eventHash: candidate.eventHash,
        explanation: `record_appended_at=${candidate.appendedAt}`,
        score,
        targetRef: candidate.claim.claimId
      };
    }
    case "contestedness": {
      const rebuttalCount = projection.rebuttalsByClaim.get(candidate.claim.claimId)?.length ?? 0;
      return {
        eventHash: candidate.eventHash,
        explanation: `rebuttal_count=${String(rebuttalCount)}`,
        score: rebuttalCount,
        targetRef: candidate.claim.claimId
      };
    }
  }
}

function compareRanked(left: ScoredClaim, right: ScoredClaim, rule: LensRule): number {
  const scoreComparison = compareScore(left.score, right.score, rule);
  if (scoreComparison !== 0) {
    return scoreComparison;
  }

  return left.eventHash.localeCompare(right.eventHash);
}

function compareScore(left: number, right: number, rule: LensRule): number {
  switch (rule.kind) {
    case "chronological":
      return rule.direction === "newest_first" ? right - left : left - right;
    case "contestedness":
      return rule.direction === "most_contested_first" ? right - left : left - right;
  }
}
