import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decryptSecret, encryptSecret } from "./crypto.js";

describe("crypto", () => {
  it("round-trips kubeconfig encryption", () => {
    const secret = "test-jwt-secret-at-least-32-characters-long";
    const kubeconfig = "apiVersion: v1\nkind: Config\nclusters: []";
    const encrypted = encryptSecret(kubeconfig, secret);
    assert.notEqual(encrypted, kubeconfig);
    assert.equal(decryptSecret(encrypted, secret), kubeconfig);
  });
});
