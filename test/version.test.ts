import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { VERSION } from "../src/version";

const require = createRequire(import.meta.url);

describe("VERSION", () => {
  it("matches package.json (bump both together)", () => {
    const pkg = require("../package.json") as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
