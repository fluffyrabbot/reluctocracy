import type { JsonValue } from "./canonical.ts";
import type {
  BriefingEvent,
  DeliberationEvent,
  DrawEvent,
  JudgmentEvent,
  PoolEpochEvent,
  ProvenanceEvent,
  RandomBeaconEvent,
  Ref
} from "./events.ts";
import type { HexSha256, LogRecord } from "./log.ts";
import { hashJson, verifyEventChain } from "./log.ts";
import { replay } from "./projections.ts";

export const publicationPacketVersion = "reluctocracy.publication.v1" as const;
export const publicationPacketHashAlgorithm = "sha256" as const;

export type PublicationPacketVersion = typeof publicationPacketVersion;
export type PublicationPacketHashAlgorithm = typeof publicationPacketHashAlgorithm;

export type PublicationPacket = {
  readonly packetVersion: PublicationPacketVersion;
  readonly packetHashAlgorithm: PublicationPacketHashAlgorithm;
  readonly packetHash: HexSha256;
  readonly judgment: JudgmentEvent;
  readonly provenance: ProvenanceEvent;
  readonly deliberation: DeliberationEvent;
  readonly draw: DrawEvent;
  readonly poolEpoch: PoolEpochEvent;
  readonly randomBeacon: RandomBeaconEvent;
  readonly briefings: readonly BriefingEvent[];
};

export type BuildProvenanceInput = {
  readonly provenanceId: Ref;
  readonly judgment: JudgmentEvent;
  readonly deliberation: DeliberationEvent;
  readonly draw: DrawEvent;
  readonly poolEpoch: PoolEpochEvent;
  readonly randomBeacon: RandomBeaconEvent;
  readonly briefings: readonly BriefingEvent[];
  readonly deliberationLogHash: HexSha256;
};

export function buildProvenance(input: BuildProvenanceInput): ProvenanceEvent {
  validateResolvedLinks(input);
  const aggregationMethod = aggregationMethodOf(input.judgment);
  const sortedBriefings = sortBriefings(input.briefings);
  const packetHash = hashPublicationPacket({
    aggregationMethod,
    briefings: sortedBriefings,
    deliberation: input.deliberation,
    deliberationLogHash: input.deliberationLogHash,
    draw: input.draw,
    judgment: input.judgment,
    poolEpoch: input.poolEpoch,
    randomBeacon: input.randomBeacon
  });

  return deepFreeze({
    aggregationMethod,
    beaconRound: input.randomBeacon.round,
    briefingRefs: sortedBriefings.map((briefing) => briefing.briefingId),
    deliberationLogHash: input.deliberationLogHash,
    deliberationRef: input.deliberation.deliberationId,
    drawRef: input.draw.drawId,
    judgmentRef: input.judgment.judgmentId,
    packetHash,
    packetHashAlgorithm: publicationPacketHashAlgorithm,
    packetVersion: publicationPacketVersion,
    poolEpochRef: input.poolEpoch.poolEpochId,
    provenanceId: input.provenanceId
  });
}

export function replayPublication(
  records: readonly LogRecord[],
  judgmentId: Ref
): PublicationPacket {
  const verification = verifyEventChain(records);
  if (!verification.ok) {
    throw new Error(`Cannot replay publication from invalid event chain: ${verification.failures.join("; ")}`);
  }
  rejectDuplicatePublicationIds(records);

  const projection = replay(records);
  const judgment = required(projection.judgments.get(judgmentId), `Judgment ${judgmentId}`);
  const provenance = required(
    projection.provenances.get(judgment.provenanceRef),
    `Provenance ${judgment.provenanceRef}`
  );
  const deliberation = required(
    projection.deliberations.get(judgment.deliberationRef),
    `Deliberation ${judgment.deliberationRef}`
  );
  const draw = required(projection.draws.get(judgment.panelRef), `Draw ${judgment.panelRef}`);
  const poolEpoch = required(
    projection.poolEpochs.get(draw.poolEpochRef),
    `PoolEpoch ${draw.poolEpochRef}`
  );
  const randomBeacon = required(
    projection.randomBeacons.get(draw.beaconRound),
    `RandomBeacon ${draw.beaconRound}`
  );
  const briefings = deliberation.briefingRefs.map((briefingRef) =>
    required(projection.briefings.get(briefingRef), `Briefing ${briefingRef}`)
  );

  validateResolvedLinks({
    briefings,
    deliberation,
    deliberationLogHash: provenance.deliberationLogHash,
    draw,
    judgment,
    poolEpoch,
    provenanceId: provenance.provenanceId,
    randomBeacon
  });
  validateProvenanceBindings(provenance, {
    briefings,
    deliberation,
    draw,
    judgment,
    poolEpoch,
    randomBeacon
  });
  validatePublicationOrdering(records, judgment, provenance, deliberation, draw, poolEpoch, randomBeacon, briefings);

  const aggregationMethod = aggregationMethodOf(judgment);
  const expectedPacketHash = hashPublicationPacket({
    aggregationMethod,
    briefings: sortBriefings(briefings),
    deliberation,
    deliberationLogHash: provenance.deliberationLogHash,
    draw,
    judgment,
    poolEpoch,
    randomBeacon
  });
  const rawProvenance = provenance as unknown as {
    readonly packetHashAlgorithm?: unknown;
    readonly packetVersion?: unknown;
  };
  if (rawProvenance.packetVersion !== publicationPacketVersion) {
    throw new Error(`Provenance ${provenance.provenanceId} has unsupported packet version ${String(rawProvenance.packetVersion)}`);
  }
  if (rawProvenance.packetHashAlgorithm !== publicationPacketHashAlgorithm) {
    throw new Error(`Provenance ${provenance.provenanceId} has unsupported packet hash algorithm ${String(rawProvenance.packetHashAlgorithm)}`);
  }
  if (provenance.packetHash !== expectedPacketHash) {
    throw new Error(`Provenance ${provenance.provenanceId} packet hash does not match resolved publication packet`);
  }

  return deepFreeze(structuredClone({
    briefings: sortBriefings(briefings),
    deliberation,
    draw,
    judgment,
    packetHash: provenance.packetHash,
    packetHashAlgorithm: provenance.packetHashAlgorithm,
    packetVersion: provenance.packetVersion,
    poolEpoch,
    provenance,
    randomBeacon
  }));
}

type ResolvedPublication = {
  readonly judgment: JudgmentEvent;
  readonly deliberation: DeliberationEvent;
  readonly draw: DrawEvent;
  readonly poolEpoch: PoolEpochEvent;
  readonly randomBeacon: RandomBeaconEvent;
  readonly briefings: readonly BriefingEvent[];
};

type PublicationCommitment = ResolvedPublication & {
  readonly aggregationMethod: string;
  readonly deliberationLogHash: HexSha256;
};

function hashPublicationPacket(commitment: PublicationCommitment): HexSha256 {
  return hashJson({
    algorithm: publicationPacketHashAlgorithm,
    packet: commitment,
    version: publicationPacketVersion
  } as unknown as JsonValue);
}

function validateResolvedLinks(input: BuildProvenanceInput): void {
  assertUniqueRefs(input.deliberation.briefingRefs, `Deliberation ${input.deliberation.deliberationId} briefing refs`);
  assertUniqueRefs(input.briefings.map((briefing) => briefing.briefingId), "resolved briefing IDs");
  if (input.judgment.deliberationRef !== input.deliberation.deliberationId) {
    throw new Error(`Judgment ${input.judgment.judgmentId} references mismatched deliberation ${input.judgment.deliberationRef}`);
  }
  if (input.judgment.panelRef !== input.draw.drawId) {
    throw new Error(`Judgment ${input.judgment.judgmentId} references mismatched Draw ${input.judgment.panelRef}`);
  }
  if (input.deliberation.panelRef !== input.draw.drawId) {
    throw new Error(`Deliberation ${input.deliberation.deliberationId} references mismatched Draw ${input.deliberation.panelRef}`);
  }
  if (input.draw.poolEpochRef !== input.poolEpoch.poolEpochId) {
    throw new Error(`Draw ${input.draw.drawId} references mismatched PoolEpoch ${input.draw.poolEpochRef}`);
  }
  if (input.draw.beaconRound !== input.randomBeacon.round) {
    throw new Error(`Draw ${input.draw.drawId} references mismatched RandomBeacon ${input.draw.beaconRound}`);
  }
  if (!sameRefSet(input.deliberation.briefingRefs, input.briefings.map((briefing) => briefing.briefingId))) {
    throw new Error(`Deliberation ${input.deliberation.deliberationId} briefing set does not match resolved briefings`);
  }
  aggregationMethodOf(input.judgment);
}

function validateProvenanceBindings(provenance: ProvenanceEvent, resolved: ResolvedPublication): void {
  if (provenance.judgmentRef !== resolved.judgment.judgmentId) {
    throw new Error(`Provenance ${provenance.provenanceId} binds mismatched Judgment ${provenance.judgmentRef}`);
  }
  if (provenance.deliberationRef !== resolved.deliberation.deliberationId) {
    throw new Error(`Provenance ${provenance.provenanceId} references mismatched deliberation ${provenance.deliberationRef}`);
  }
  if (provenance.drawRef !== resolved.draw.drawId) {
    throw new Error(`Provenance ${provenance.provenanceId} references mismatched Draw ${provenance.drawRef}`);
  }
  if (provenance.poolEpochRef !== resolved.poolEpoch.poolEpochId) {
    throw new Error(`Provenance ${provenance.provenanceId} references mismatched PoolEpoch ${provenance.poolEpochRef}`);
  }
  if (provenance.beaconRound !== resolved.randomBeacon.round) {
    throw new Error(`Provenance ${provenance.provenanceId} references mismatched RandomBeacon ${provenance.beaconRound}`);
  }
  if (!sameRefSet(provenance.briefingRefs, resolved.briefings.map((briefing) => briefing.briefingId))) {
    throw new Error(`Provenance ${provenance.provenanceId} briefing set does not match Deliberation ${resolved.deliberation.deliberationId}`);
  }
  if (provenance.aggregationMethod !== aggregationMethodOf(resolved.judgment)) {
    throw new Error(`Provenance ${provenance.provenanceId} aggregation method does not match Judgment ${resolved.judgment.judgmentId}`);
  }
}

function validatePublicationOrdering(
  records: readonly LogRecord[],
  judgment: JudgmentEvent,
  provenance: ProvenanceEvent,
  deliberation: DeliberationEvent,
  draw: DrawEvent,
  poolEpoch: PoolEpochEvent,
  randomBeacon: RandomBeaconEvent,
  briefings: readonly BriefingEvent[]
): void {
  const provenanceRecord = eventRecord(records, "Provenance", provenance.provenanceId);
  const judgmentRecord = eventRecord(records, "Judgment", judgment.judgmentId);
  const poolEpochRecord = eventRecord(records, "PoolEpoch", poolEpoch.poolEpochId);
  const randomBeaconRecord = eventRecord(records, "RandomBeacon", randomBeacon.round);
  const drawRecord = eventRecord(records, "Draw", draw.drawId);
  const deliberationRecord = eventRecord(records, "Deliberation", deliberation.deliberationId);
  const briefingRecords = briefings.map((briefing) =>
    eventRecord(records, "Briefing", briefing.briefingId)
  );

  if (poolEpochRecord.sequence >= drawRecord.sequence || randomBeaconRecord.sequence >= drawRecord.sequence) {
    throw new Error(`Draw ${draw.drawId} must follow its PoolEpoch and RandomBeacon`);
  }
  if (drawRecord.sequence >= deliberationRecord.sequence) {
    throw new Error(`Deliberation ${deliberation.deliberationId} must follow Draw ${draw.drawId}`);
  }
  if (
    deliberationRecord.sequence >= provenanceRecord.sequence ||
    briefingRecords.some((record) => record.sequence >= provenanceRecord.sequence)
  ) {
    throw new Error(`Provenance ${provenance.provenanceId} appears before a packet prerequisite`);
  }
  if (provenanceRecord.sequence >= judgmentRecord.sequence) {
    throw new Error(`Provenance ${provenance.provenanceId} must precede Judgment ${judgment.judgmentId}`);
  }
  if (provenanceRecord.previousHash !== provenance.deliberationLogHash) {
    throw new Error(`Provenance ${provenance.provenanceId} does not commit the preceding deliberation log head`);
  }
}

function rejectDuplicatePublicationIds(records: readonly LogRecord[]): void {
  const provenanceIds: string[] = [];
  const briefingIds: string[] = [];
  const judgmentIds: string[] = [];
  for (const record of records) {
    if (record.event.type === "Provenance") provenanceIds.push(record.event.payload.provenanceId);
    if (record.event.type === "Briefing") briefingIds.push(record.event.payload.briefingId);
    if (record.event.type === "Judgment") judgmentIds.push(record.event.payload.judgmentId);
  }
  assertUniqueRefs(provenanceIds, "Provenance IDs");
  assertUniqueRefs(briefingIds, "Briefing IDs");
  assertUniqueRefs(judgmentIds, "Judgment IDs");
}

function eventRecord(
  records: readonly LogRecord[],
  type: "Briefing" | "Deliberation" | "Draw" | "Judgment" | "PoolEpoch" | "Provenance" | "RandomBeacon",
  id: string
): LogRecord {
  const record = records.find((candidate) => {
    if (candidate.event.type !== type) return false;
    switch (candidate.event.type) {
      case "Briefing": return candidate.event.payload.briefingId === id;
      case "Deliberation": return candidate.event.payload.deliberationId === id;
      case "Draw": return candidate.event.payload.drawId === id;
      case "Judgment": return candidate.event.payload.judgmentId === id;
      case "PoolEpoch": return candidate.event.payload.poolEpochId === id;
      case "Provenance": return candidate.event.payload.provenanceId === id;
      case "RandomBeacon": return candidate.event.payload.round === id;
    }
  });
  return required(record, `${type} record ${id}`);
}

function aggregationMethodOf(judgment: JudgmentEvent): string {
  const method = judgment.anonymizedAggregate.method;
  if (typeof method !== "string" || method.length === 0) {
    throw new Error(`Judgment ${judgment.judgmentId} lacks an aggregation method`);
  }
  return method;
}

function assertUniqueRefs(refs: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref)) throw new Error(`${label} contain duplicate ID ${ref}`);
    seen.add(ref);
  }
}

function sameRefSet(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length &&
    sortedLeft.every((ref, index) => ref === sortedRight[index]);
}

function sortBriefings(briefings: readonly BriefingEvent[]): readonly BriefingEvent[] {
  return [...briefings].sort((left, right) => left.briefingId.localeCompare(right.briefingId));
}

function required<Value>(value: Value | undefined, label: string): Value {
  if (value === undefined) throw new Error(`${label} does not resolve`);
  return value;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
