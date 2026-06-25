export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }

  if (value !== null && typeof value === "object") {
    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child !== undefined) {
        normalized[key] = normalize(child);
      }
    }
    return normalized;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Canonical JSON cannot encode non-finite numbers.");
  }

  return value;
}
