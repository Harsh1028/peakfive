import { describe, it, expect } from "vitest";
import { passwordSchema, signupSchema, safeDestination } from "./account";
describe("account safety", () => {
  it("requires strong matching passwords and a name", () => {
    const input = {
      name: "Test Engineer",
      email: "engineer@example.org",
      password: "StrongPass123",
      confirm: "StrongPass123",
      accepted: true,
    };
    expect(signupSchema.safeParse(input).success).toBe(true);
    expect(signupSchema.safeParse({ ...input, confirm: "WrongPass123" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...input, name: "" }).success).toBe(false);
    expect(passwordSchema.safeParse("short1A").success).toBe(false);
  });
  it("requires acknowledgement of draft documents", () => {
    expect(
      signupSchema.safeParse({
        name: "Test Engineer",
        email: "engineer@example.org",
        password: "StrongPass123",
        confirm: "StrongPass123",
        accepted: false,
      }).success,
    ).toBe(false);
  });
  it("never redirects to external origins or unapproved paths", () => {
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      "/demo",
      "/dashboard/evil",
    ]) {
      expect(safeDestination(path)).toBe("/dashboard");
    }
    expect(safeDestination("/scenarios")).toBe("/scenarios");
    expect(safeDestination("/settings")).toBe("/settings");
  });
});
