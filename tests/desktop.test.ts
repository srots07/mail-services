import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { desktopTokenMatches } from "@/lib/auth/desktop";

describe("Desktop launch token", () => {
  const token = "a".repeat(64);

  it("accepts only the exact token", () => {
    assert.equal(desktopTokenMatches(token, token), true);
    assert.equal(desktopTokenMatches(token, `${token}x`), false);
    assert.equal(desktopTokenMatches(token, "b".repeat(64)), false);
  });

  it("rejects a missing token or an unset expected token", () => {
    assert.equal(desktopTokenMatches(token, null), false);
    assert.equal(desktopTokenMatches(token, ""), false);
    assert.equal(desktopTokenMatches("", ""), false);
    assert.equal(desktopTokenMatches("", token), false);
  });
});
