import { describe, expect, it } from "vitest";
import { authReturnPath } from "@/lib/auth-redirect";

describe("authentication return destinations", () => {
  it("preserves invitation paths and local query/hash values", () => {
    expect(authReturnPath("/invitations/test-token")).toBe("/invitations/test-token");
    expect(authReturnPath("/families/example?view=mine#tab=people")).toBe("/families/example?view=mine#tab=people");
    expect(authReturnPath("/")).toBe("/");
  });

  it.each([
    undefined, ["/me", "/families"], "", "me", "https://example.com", "//example.com",
    "/\\example.com", "/ /example.com", "/\n/example.com", "/\t/example.com",
    "javascript:alert(1)", "/login", "/register?next=/login", "/a/../login/",
  ])("rejects unsafe or recursive destination %s", (value) => {
    expect(authReturnPath(value)).toBeNull();
  });
});
