import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { formatDir, readSampleJson, sampleNames as samples } from "./samples";

const schema = JSON.parse(readFileSync(formatDir + "inkd.schema.json", "utf8")) as object;

const validate = new Ajv2020({ allErrors: true }).compile(schema);

describe("format samples", () => {
  it("exist", () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples)("%s matches the schema", (name) => {
    validate(readSampleJson(name));
    expect(validate.errors).toBeNull();
  });
});

describe("schema", () => {
  const minimal = () => readSampleJson("minimal.inkd");

  it("rejects a newer format version", () => {
    const doc = minimal();
    doc.formatVersion = 2;
    expect(validate(doc)).toBe(false);
  });

  it("rejects a point with fewer than six values", () => {
    const doc = minimal();
    doc.pages[0].strokes[0].points[0].pop();
    expect(validate(doc)).toBe(false);
  });

  it("rejects an unknown tool", () => {
    const doc = minimal();
    doc.pages[0].strokes[0].tool = "brush";
    expect(validate(doc)).toBe(false);
  });
});
