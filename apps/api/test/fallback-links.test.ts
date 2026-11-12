import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { exposeFallbackLinks, isOriginAllowed } from "../src/config/security";

const previous = { env: process.env.NODE_ENV, front: process.env.FRONTEND_URL, ext: process.env.EXTENSION_ORIGINS };
afterEach(() => {
  for (const [key, value] of [["NODE_ENV", previous.env], ["FRONTEND_URL", previous.front], ["EXTENSION_ORIGINS", previous.ext]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("exposeFallbackLinks", () => {
  it("hands secret links back only outside production", () => {
    process.env.NODE_ENV = "development";
    assert.equal(exposeFallbackLinks(), true);
    process.env.NODE_ENV = "production";
    assert.equal(exposeFallbackLinks(), false);
  });
});

describe("isOriginAllowed (CORS)", () => {
  it("in production, only the front-end and the declared extensions are accepted", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://app.example.com";
    process.env.EXTENSION_ORIGINS = "chrome-extension://abc";
    assert.equal(isOriginAllowed("https://app.example.com"), true);
    assert.equal(isOriginAllowed("https://app.example.com/"), true);
    assert.equal(isOriginAllowed("chrome-extension://abc"), true);
    assert.equal(isOriginAllowed("https://evil.example"), false);
    assert.equal(isOriginAllowed("http://localhost:3100"), false);
    assert.equal(isOriginAllowed("chrome-extension://autre"), false);
    assert.equal(isOriginAllowed(undefined), true); // no Origin header: not a browser cross-site call
  });

  it("in development, localhost and any unpacked extension work without setup", () => {
    process.env.NODE_ENV = "development";
    delete process.env.FRONTEND_URL;
    assert.equal(isOriginAllowed("http://localhost:3100"), true);
    assert.equal(isOriginAllowed("chrome-extension://nimportelequel"), true);
    assert.equal(isOriginAllowed("https://evil.example"), false);
  });
});
