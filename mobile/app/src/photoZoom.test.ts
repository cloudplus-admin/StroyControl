import { describe, expect, it } from "vitest";
import { anchoredPhotoOffset, clampPhotoOffset, clampPhotoScale, containedPhotoSize, pinchScale, touchCenter, touchDistance } from "./photoZoom";

describe("photo pinch zoom", () => {
  it("tracks distance from the fixed beginning of a gesture", () => {
    expect(pinchScale(1, 100, 150)).toBe(1.5);
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 200, 100)).toBe(1);
  });

  it("clamps invalid and out-of-range values", () => {
    expect(clampPhotoScale(Number.NaN)).toBe(1);
    expect(pinchScale(4, 100, 200)).toBe(4);
    expect(pinchScale(2, 100, 10)).toBe(1);
  });

  it("is unaffected when Android swaps touch order", () => {
    const touches = [{ pageX: 20, pageY: 30 }, { pageX: 120, pageY: 30 }];
    expect(touchDistance(touches)).toBe(touchDistance([...touches].reverse()));
  });

  it("uses coordinates local to the photo viewport when available", () => {
    const touches = [
      { pageX: 110, pageY: 220, locationX: 10, locationY: 20 },
      { pageX: 130, pageY: 260, locationX: 30, locationY: 60 },
    ];
    expect(touchCenter(touches)).toEqual({ x: 20, y: 40 });
    expect(touchDistance(touches)).toBeCloseTo(Math.hypot(20, 40));
  });
});

describe("photo focal point", () => {
  it("keeps the content under an off-center pinch focal point", () => {
    expect(anchoredPhotoOffset(0, 1, 2, 75, 75, 50)).toBe(-25);
    expect(anchoredPhotoOffset(10, 2, 4, 75, 80, 50)).toBe(0);
  });

  it("follows the midpoint when both fingers move together", () => {
    expect(touchCenter([{ pageX: 10, pageY: 20 }, { pageX: 30, pageY: 60 }])).toEqual({ x: 20, y: 40 });
    expect(anchoredPhotoOffset(0, 2, 2, 50, 65, 50)).toBe(15);
  });

  it("prevents panning beyond the scaled image bounds", () => {
    expect(clampPhotoOffset(900, 2, 400)).toBe(200);
    expect(clampPhotoOffset(-900, 2, 400)).toBe(-200);
    expect(clampPhotoOffset(50, 1, 400)).toBe(0);
  });

  it("uses the actual contained photo size for portrait and landscape bounds", () => {
    expect(containedPhotoSize(1000, 2000, 400, 800)).toEqual({ width: 400, height: 800 });
    expect(containedPhotoSize(2000, 1000, 400, 800)).toEqual({ width: 400, height: 200 });
    expect(clampPhotoOffset(100, 2, 800, 200)).toBe(0);
    expect(clampPhotoOffset(500, 4, 800, 400)).toBe(400);
  });
});
