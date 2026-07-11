import { describe, expect, it } from "vitest";
import { cycleOrder } from "../src/txEngine";
import { mulberry32 } from "../src/simulate";

describe("cycleOrder", () => {
  it("always starts with frame 0 and is a permutation", () => {
    const rnd = mulberry32(7);
    for (let cycle = 0; cycle < 20; cycle++) {
      const order = cycleOrder(12, cycle, true, rnd);
      expect(order[0]).toBe(0);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    }
  });

  it("returns identity when rotation is off", () => {
    expect(cycleOrder(5, 3, false)).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns identity for cycle 0 even with rotation on", () => {
    expect(cycleOrder(5, 0, true, mulberry32(1))).toEqual([0, 1, 2, 3, 4]);
  });

  it("is deterministic under a seeded random source", () => {
    const a = cycleOrder(20, 1, true, mulberry32(123));
    const b = cycleOrder(20, 1, true, mulberry32(123));
    expect(a).toEqual(b);
  });

  it("actually shuffles for cycles >= 1", () => {
    // with 19 shuffled elements an identity result is astronomically unlikely
    const order = cycleOrder(20, 1, true, mulberry32(5));
    expect(order).not.toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
