import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

type CloudFrontRequest = {
  method: string;
  uri: string;
  querystring: Record<string, { value: string }>;
  headers: Record<string, { value: string }>;
  cookies: Record<string, { value: string }>;
};

type CloudFrontHandler = (event: {
  request: CloudFrontRequest;
}) => CloudFrontRequest;

const functionPath = resolve(process.cwd(), "deployment/spa-rewrite.js");

function loadHandler(): CloudFrontHandler {
  const source = readFileSync(functionPath, "utf8");
  return runInNewContext(`${source}\nhandler;`) as CloudFrontHandler;
}

function createEvent(uri: string, method = "GET") {
  return {
    request: {
      method,
      uri,
      querystring: { filter: { value: "recent" } },
      headers: {},
      cookies: {},
    },
  };
}

describe("CloudFront SPA rewrite", () => {
  it("rewrites an extensionless static route to the application shell", () => {
    const handler = loadHandler();
    const event = createEvent("/metrics/heart-rate");

    const request = handler(event);

    expect(request).toBe(event.request);
    expect(request.uri).toBe("/index.html");
    expect(request.querystring).toEqual({ filter: { value: "recent" } });
  });

  it("never rewrites an API path", () => {
    const handler = loadHandler();
    const event = createEvent("/api/v1/metrics/");

    const request = handler(event);

    expect(request.uri).toBe("/api/v1/metrics/");
  });

  it.each(["/assets/missing.js", "/assets/missing", "/favicon.svg"])(
    "does not rewrite the static file path %s",
    (uri) => {
      const handler = loadHandler();
      const event = createEvent(uri);

      const request = handler(event);

      expect(request.uri).toBe(uri);
    },
  );

  it("rewrites an extensionless HEAD request to the application shell", () => {
    const handler = loadHandler();
    const event = createEvent("/settings", "HEAD");

    expect(handler(event).uri).toBe("/index.html");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "does not rewrite a %s request",
    (method) => {
      const handler = loadHandler();
      const event = createEvent("/settings", method);

      expect(handler(event)).toBe(event.request);
      expect(event.request.uri).toBe("/settings");
    },
  );
});
