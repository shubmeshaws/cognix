import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAffirmativeReply,
  isNegativeReply,
  parsePendingSpellOffer,
  resolveMeshyConversationTurn,
} from "./meshy-conversation.js";
import { splitListOfferVoiceScript, voiceListTurnScript } from "./meshy-voice-style.js";

describe("splitListOfferVoiceScript", () => {
  it("splits list intro and spell offer into two lines", () => {
    const lines = voiceListTurnScript("nodes", []);
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /these are the nodes list/i);
    assert.match(lines[1]!, /should i spell the list/i);
  });

  it("splits a combined single line", () => {
    const split = splitListOfferVoiceScript([
      "These are the nodes list, Sir. Should I spell the list for you, Sir?",
    ]);
    assert.equal(split.length, 2);
    assert.match(split[0]!, /these are the nodes list/i);
    assert.match(split[1]!, /should i spell the list/i);
  });
});

describe("spell offer yes/no replies", () => {
  const history = [
    { role: "user" as const, content: "list them" },
    {
      role: "assistant" as const,
      content:
        "These are the nodes list, Sir. Should I spell the list for you, Sir?",
    },
  ];

  it("detects pending spell offer", () => {
    assert.ok(parsePendingSpellOffer(history[1]!.content));
  });

  for (const yes of ["yes", "yes please", "please", "ya", "yeah", "yup"]) {
    it(`accepts yes reply: ${yes}`, () => {
      assert.ok(isAffirmativeReply(yes));
      const r = resolveMeshyConversationTurn(yes, history, true);
      assert.equal(r.kind, "continue");
      if (r.kind === "continue") assert.match(r.message, /spell nodes names/i);
    });
  }

  for (const no of ["no", "naah", "nope", "no please", "not required", "no thanks"]) {
    it(`accepts no reply: ${no}`, () => {
      assert.ok(isNegativeReply(no));
      const r = resolveMeshyConversationTurn(no, history, true);
      assert.equal(r.kind, "cancel");
    });
  }

  it("declines list when user says don't list them", () => {
    const r = resolveMeshyConversationTurn("don't list them", history, true);
    assert.equal(r.kind, "cancel");
  });
});
