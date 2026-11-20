import { describe, expect, test } from "bun:test";
import { getExtensionWindowError } from "./extension-window";

describe("getExtensionWindowError", () => {
  test("says nothing once the window is open", () => {
    expect(getExtensionWindowError("Bitwarden", "opened")).toBeUndefined();
  });

  test("asks for a restart while the extension isn't loaded", () => {
    expect(getExtensionWindowError("Bitwarden", "notLoaded")).toBe(
      "Bitwarden starts after ggmail restarts. Restart ggmail, then try again.",
    );
  });

  test("doesn't ask for a restart when a loaded extension's window is refused", () => {
    const error = getExtensionWindowError("Bitwarden", "refused");

    expect(error).toBe("Bitwarden is running, but ggmail can't open a window for it.");

    expect(error).not.toContain("Restart");
  });
});
