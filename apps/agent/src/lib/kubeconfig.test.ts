import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseKubeconfig } from "./kubeconfig.js";

const sampleKubeconfig = `
apiVersion: v1
kind: Config
clusters:
  - name: demo
    cluster:
      server: https://k8s.example.com:6443
contexts:
  - name: demo
    context:
      cluster: demo
      user: demo
current-context: demo
users:
  - name: demo
    user:
      token: test-token
`;

describe("parseKubeconfig", () => {
  it("extracts server URL and context", () => {
    const parsed = parseKubeconfig(sampleKubeconfig);
    assert.equal(parsed.serverUrl, "https://k8s.example.com:6443");
    assert.equal(parsed.contextName, "demo");
  });

  it("honors explicit contextName", () => {
    const parsed = parseKubeconfig(sampleKubeconfig, "demo");
    assert.equal(parsed.contextName, "demo");
  });
});
