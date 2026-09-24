import test from "node:test";
import assert from "node:assert/strict";
import { sameOrigin, bodyTooLarge } from "../src/security.js";

test("sameOrigin accepts matching browser origin and requests without Origin", () => {
  assert.equal(sameOrigin(new Request("https://secretnests.com/x",{headers:{origin:"https://secretnests.com"}}),"https://secretnests.com"),true);
  assert.equal(sameOrigin(new Request("https://secretnests.com/x"),"https://secretnests.com"),true);
  assert.equal(sameOrigin(new Request("https://secretnests.com/x",{headers:{origin:"https://evil.example"}}),"https://secretnests.com"),false);
});

test("body size guard", () => {
  assert.equal(bodyTooLarge(new Request("https://x.test",{headers:{"content-length":"9000"}}),8192),true);
  assert.equal(bodyTooLarge(new Request("https://x.test",{headers:{"content-length":"100"}}),8192),false);
});
