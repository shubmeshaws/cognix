import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatHostnameForSpeech } from "./meshy-hostname-speech.js";

describe("formatHostnameForSpeech", () => {
  it("pronounces EC2-style node hostnames", () => {
    const spoken = formatHostnameForSpeech(
      "ip-10-1-100-156.ap-south-1.compute.internal",
    );
    assert.equal(
      spoken,
      "eyepee ten one onehundred onefiftysix dot ayepee south one dot compute dot internal",
    );
  });

  it("pronounces ip and ap tokens distinctly", () => {
    assert.equal(formatHostnameForSpeech("ip-10-0-0-1"), "eyepee ten zero zero one");
    assert.equal(formatHostnameForSpeech("ap-south-1"), "ayepee south one");
  });
});
