import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";
import { server, experimentHistory } from "../server.js";

function request(
  baseUrl: string,
  method: string,
  path: string,
  body?: string | object,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqBody = typeof body === "object" ? JSON.stringify(body) : body;
    const reqHeaders: Record<string, string> = { ...headers };
    if (typeof body === "object" && !reqHeaders["Content-Type"]) {
      reqHeaders["Content-Type"] = "application/json";
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on("error", reject);
    if (reqBody) {
      req.write(reqBody);
    }
    req.end();
  });
}

describe("Chaos Verifier HTTP Server Suite", () => {
  let baseUrl: string;

  before(() => {
    return new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it("handles OPTIONS preflight requests with CORS headers", async () => {
    const res = await request(baseUrl, "OPTIONS", "/v1/experiments");
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers["access-control-allow-origin"], "*");
    assert.strictEqual(res.headers["access-control-allow-methods"], "GET, POST, OPTIONS");
  });

  it("GET /healthz returns status ok", async () => {
    const res = await request(baseUrl, "GET", "/healthz");
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { status: "ok", service: "chaos-verifier" });
  });

  it("GET /v1/scenarios returns list of available scenarios", async () => {
    const res = await request(baseUrl, "GET", "/v1/scenarios");
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
  });

  it("GET /v1/experiments returns experiment history and respects limit parameter", async () => {
    const resAll = await request(baseUrl, "GET", "/v1/experiments");
    assert.strictEqual(resAll.status, 200);
    assert.ok(Array.isArray(resAll.body));
    assert.ok(resAll.body.length >= 1);

    const resLimit1 = await request(baseUrl, "GET", "/v1/experiments?limit=1");
    assert.strictEqual(resLimit1.status, 200);
    assert.ok(Array.isArray(resLimit1.body));
    assert.strictEqual(resLimit1.body.length, 1);

    const resLimit0 = await request(baseUrl, "GET", "/v1/experiments?limit=0");
    assert.strictEqual(resLimit0.status, 200);
    assert.ok(Array.isArray(resLimit0.body));
    assert.strictEqual(resLimit0.body.length, 0);

    const resLimitInvalid = await request(baseUrl, "GET", "/v1/experiments?limit=invalid");
    assert.strictEqual(resLimitInvalid.status, 200);
    assert.ok(Array.isArray(resLimitInvalid.body));
    assert.strictEqual(resLimitInvalid.body.length, experimentHistory.length);
  });

  it("POST /v1/experiments triggers chaos experiment and prepends result to history", async () => {
    const payload = {
      experiment_id: "chs_test_http_01",
      scenario_type: "LATENCY_SPIKE",
      target_service: "auth-service-test",
      intensity: 10,
      duration_seconds: 5,
      sla_max_mttr_ms: 10000,
      sla_max_detection_ms: 2000,
    };

    const res = await request(baseUrl, "POST", "/v1/experiments", payload);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.experiment_id, "chs_test_http_01");
    assert.strictEqual(res.body.target_service, "auth-service-test");
    assert.strictEqual(res.body.injected_events_count, 50);
    assert.ok(typeof res.body.passed_sla === "boolean");

    const historyRes = await request(baseUrl, "GET", "/v1/experiments?limit=1");
    assert.strictEqual(historyRes.body[0].experiment_id, "chs_test_http_01");
  });

  it("POST /v1/experiments handles malformed JSON body with HTTP 400", async () => {
    const res = await request(baseUrl, "POST", "/v1/experiments", "{ bad_json: ", {
      "Content-Type": "application/json",
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  it("returns 404 for unknown endpoints", async () => {
    const res = await request(baseUrl, "GET", "/unknown-route");
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: "Not found" });
  });
});
