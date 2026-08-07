import { describe, expect, it } from "vitest";
import { tabForNotification } from "./navigation";

describe("notification navigation", () => {
  it("opens the original task", () => {
    expect(tabForNotification({ screen: "task", id: "task-1" })).toBe("tasks");
  });

  it("opens the original quality report", () => {
    expect(tabForNotification({ screen: "quality", id: "report-1" })).toBe("quality");
  });

  it("opens the original warehouse material", () => {
    expect(tabForNotification({ screen: "material", id: "material-1" })).toBe("supply");
  });

  it("opens documents and acts in the server-backed document area", () => {
    expect(tabForNotification({ screen: "document", id: "document-1" })).toBe("feed");
    expect(tabForNotification({ screen: "act", id: "act-1" })).toBe("feed");
  });
});
