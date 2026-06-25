import { createHash } from "node:crypto";

import { canonicalJson, type JsonValue } from "./canonical.ts";
import type { AnyProtocolEvent } from "./events.ts";

export type HexSha256 = string;

export type SignatureBundle = {
  readonly publicKey: string;
  readonly signature: string;
};

export type LogRecord = {
  readonly sequence: number;
  readonly previousHash: HexSha256 | null;
  readonly eventHash: HexSha256;
  readonly recordHash: HexSha256;
  readonly appendedAt: string;
  readonly event: AnyProtocolEvent;
  readonly signature: SignatureBundle;
};

export type AppendOptions = {
  readonly appendedAt?: string;
};

export type ChainVerification =
  | {
      readonly ok: true;
      readonly headHash: HexSha256 | null;
      readonly recordCount: number;
    }
  | {
      readonly ok: false;
      readonly failures: readonly string[];
      readonly headHash: HexSha256 | null;
      readonly recordCount: number;
    };

export class AppendOnlyEventLog {
  readonly #records: LogRecord[] = [];

  append(
    event: AnyProtocolEvent,
    signature: SignatureBundle,
    options: AppendOptions = {}
  ): LogRecord {
    const previousHash = this.#records.at(-1)?.recordHash ?? null;
    const eventHash = hashJson(event as unknown as JsonValue);
    const body = {
      appendedAt: options.appendedAt ?? new Date().toISOString(),
      event,
      eventHash,
      previousHash,
      sequence: this.#records.length,
      signature
    } satisfies Omit<LogRecord, "recordHash">;
    const record = {
      ...body,
      recordHash: hashJson(body as unknown as JsonValue)
    } satisfies LogRecord;

    this.#records.push(record);
    return structuredClone(record);
  }

  records(): readonly LogRecord[] {
    return structuredClone(this.#records);
  }

  headHash(): HexSha256 | null {
    return this.#records.at(-1)?.recordHash ?? null;
  }
}

export function verifyEventChain(records: readonly LogRecord[]): ChainVerification {
  const failures: string[] = [];

  for (const [index, record] of records.entries()) {
    if (record.sequence !== index) {
      failures.push(
        `record ${String(index)}: expected sequence ${String(index)}, got ${String(record.sequence)}`
      );
    }

    const expectedPreviousHash = index === 0 ? null : records[index - 1]?.recordHash;
    if (record.previousHash !== expectedPreviousHash) {
      failures.push(`record ${String(index)}: previousHash does not match prior recordHash`);
    }

    const expectedEventHash = hashJson(record.event as unknown as JsonValue);
    if (record.eventHash !== expectedEventHash) {
      failures.push(`record ${String(index)}: eventHash does not match event content`);
    }

    const body = {
      appendedAt: record.appendedAt,
      event: record.event,
      eventHash: record.eventHash,
      previousHash: record.previousHash,
      sequence: record.sequence,
      signature: record.signature
    } satisfies Omit<LogRecord, "recordHash">;
    const expectedRecordHash = hashJson(body as unknown as JsonValue);
    if (record.recordHash !== expectedRecordHash) {
      failures.push(`record ${String(index)}: recordHash does not match record content`);
    }
  }

  const headHash = records.at(-1)?.recordHash ?? null;
  if (failures.length > 0) {
    return {
      failures,
      headHash,
      ok: false,
      recordCount: records.length
    };
  }

  return {
    headHash,
    ok: true,
    recordCount: records.length
  };
}

export function hashJson(value: JsonValue): HexSha256 {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
