import { rankClaims, type RankedLensItem } from "./curation.ts";
import type { ClaimEvent, LensEvent, RebuttalEvent, Ref } from "./events.ts";
import type { HexSha256, LogRecord } from "./log.ts";
import type { ProjectionState } from "./projections.ts";

export type RankedRebuttalItem = {
  readonly rebuttal: RebuttalEvent;
  readonly rank: number;
  readonly score: number;
  readonly explanation: string;
  readonly eventHash: HexSha256;
};

export type ClaimRebuttalRenderItem = {
  readonly claim: ClaimEvent;
  readonly claimRank: RankedLensItem;
  readonly strongestRebuttal: RankedRebuttalItem;
  readonly moderationBoundary: "procedural_colocation";
};

type RebuttalCandidate = {
  readonly rebuttal: RebuttalEvent;
  readonly appendedAt: string;
  readonly eventHash: HexSha256;
  readonly score: number;
};

export function rankRebuttalsForClaim(
  claimRef: Ref,
  records: readonly LogRecord[]
): readonly RankedRebuttalItem[] {
  return records
    .flatMap((record) => rebuttalCandidateForClaim(claimRef, record))
    .toSorted(compareRebuttalCandidates)
    .map((candidate, index) => ({
      eventHash: candidate.eventHash,
      explanation: `basis_ref_count=${String(candidate.score)}; record_appended_at=${candidate.appendedAt}`,
      rank: index + 1,
      rebuttal: candidate.rebuttal,
      score: candidate.score
    }));
}

export function renderClaimRebuttalSurface(
  lens: LensEvent,
  records: readonly LogRecord[],
  projection: ProjectionState
): readonly ClaimRebuttalRenderItem[] {
  return rankClaims(lens, records, projection).map((claimRank) => {
    const claim = projection.claims.get(claimRank.targetRef);
    if (claim === undefined) {
      throw new Error(`Cannot render missing claim ${claimRank.targetRef}`);
    }

    const strongestRebuttal = rankRebuttalsForClaim(claim.claimId, records)[0];
    if (strongestRebuttal === undefined) {
      throw new Error(`Cannot render claim ${claim.claimId} without a rebuttal`);
    }

    return {
      claim,
      claimRank,
      moderationBoundary: "procedural_colocation",
      strongestRebuttal
    };
  });
}

function rebuttalCandidateForClaim(
  claimRef: Ref,
  record: LogRecord
): readonly RebuttalCandidate[] {
  if (record.event.type !== "Rebuttal" || record.event.payload.targetClaimRef !== claimRef) {
    return [];
  }

  return [
    {
      appendedAt: record.appendedAt,
      eventHash: record.eventHash,
      rebuttal: record.event.payload,
      score: record.event.payload.basisRefs?.length ?? 0
    }
  ];
}

function compareRebuttalCandidates(left: RebuttalCandidate, right: RebuttalCandidate): number {
  const scoreComparison = right.score - left.score;
  if (scoreComparison !== 0) {
    return scoreComparison;
  }

  const appendedAtComparison = Date.parse(right.appendedAt) - Date.parse(left.appendedAt);
  if (appendedAtComparison !== 0) {
    return appendedAtComparison;
  }

  return left.eventHash.localeCompare(right.eventHash);
}
