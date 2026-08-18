import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentCoordinates } from "./Operations";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCurrentCoordinates", () => {
  it("returns fresh high-accuracy browser coordinates", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 41.3111, longitude: 69.2797, accuracy: 8 } } as GeolocationPosition);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentCoordinates()).resolves.toEqual({
      latitude: 41.3111,
      longitude: 69.2797,
      accuracy: 8,
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });

  it("explains when the user denies location access", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1 } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });

    await expect(getCurrentCoordinates()).rejects.toThrow("Доступ к геолокации запрещен");
  });

  it("fails clearly when geolocation is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await expect(getCurrentCoordinates()).rejects.toThrow("Геолокация не поддерживается");
  });
});
