import { beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "../auth/auth-session";
import { downloadMetricEntriesCsv } from "./metric-entry-export-api";

describe("metric entry CSV export", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAccessToken("test-access-token");
  });

  it("downloads the authenticated CSV with the selected filters", async () => {
    const csv = new Blob(["metric_slug,value\nbody_weight,84.2\n"], {
      type: "text/csv",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(csv, {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      }),
    );
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:metric-export");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await downloadMetricEntriesCsv({
      metric: "body_weight",
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-20T23:59:59Z",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/metrics/entries/export/?metric=body_weight&from=2026-09-01T00%3A00%3A00Z&to=2026-09-20T23%3A59%3A59Z",
      {
        method: "GET",
        headers: { Authorization: "Bearer test-access-token" },
      },
    );
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:metric-export");
  });
});
