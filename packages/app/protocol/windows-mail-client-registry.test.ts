import { describe, expect, test } from "bun:test";
import { buildRegistration, parseUserChoiceProgIds } from "./windows-mail-client-registry";

const EXECUTABLE_PATH = String.raw`C:\Program Files\ggmail\ggmail.exe`;

describe("buildRegistration", () => {
  test("escapes the executable path in every value that carries it", () => {
    const registration = buildRegistration(EXECUTABLE_PATH);

    expect(registration).toContain(String.raw`@="C:\\Program Files\\ggmail\\ggmail.exe,0"`);
    expect(registration).toContain(String.raw`@="\"C:\\Program Files\\ggmail\\ggmail.exe\" \"%1\""`);
    expect(registration).toContain(String.raw`@="\"C:\\Program Files\\ggmail\\ggmail.exe\""`);
    expect(registration).toContain(
      String.raw`"ApplicationIcon"="C:\\Program Files\\ggmail\\ggmail.exe,0"`,
    );
  });

  test("writes the keys Default apps reads", () => {
    const lines = buildRegistration(EXECUTABLE_PATH).split("\r\n");

    expect(lines[0]).toBe("Windows Registry Editor Version 5.00");

    expect(lines).toContain(String.raw`[-HKEY_CURRENT_USER\Software\ggmail]`);
    expect(lines).toContain(String.raw`[HKEY_CURRENT_USER\Software\Classes\ggmail.mailto]`);
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Classes\ggmail.mailto\shell\open\command]`,
    );
    expect(lines).toContain(String.raw`[HKEY_CURRENT_USER\Software\Classes\mailto]`);
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Capabilities]`,
    );
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Capabilities\URLAssociations]`,
    );
    expect(lines).toContain(String.raw`"mailto"="ggmail.mailto"`);
    expect(lines).toContain(String.raw`[HKEY_CURRENT_USER\Software\RegisteredApplications]`);
    expect(lines).toContain(String.raw`"ggmail"="Software\\Clients\\Mail\\ggmail\\Capabilities"`);
  });

  test("writes the keys a browser picker reads", () => {
    const lines = buildRegistration(EXECUTABLE_PATH).split("\r\n");

    expect(lines).toContain(String.raw`[HKEY_CURRENT_USER\Software\Classes\ggmail.url]`);
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Classes\ggmail.url\shell\open\command]`,
    );
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail]`,
    );
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\shell\open\command]`,
    );
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\Capabilities]`,
    );
    expect(lines).toContain(
      String.raw`[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\Capabilities\URLAssociations]`,
    );
    expect(lines).toContain(String.raw`"http"="ggmail.url"`);
    expect(lines).toContain(String.raw`"https"="ggmail.url"`);
    expect(lines).toContain(
      String.raw`"ggmail.url"="Software\\Clients\\StartMenuInternet\\ggmail\\Capabilities"`,
    );
  });

  test("ends every line with a carriage return", () => {
    expect(buildRegistration(EXECUTABLE_PATH)).not.toMatch(/[^\r]\n/);
  });
});

describe("parseUserChoiceProgIds", () => {
  test("reads the prog id value off the legacy key", () => {
    expect(
      parseUserChoiceProgIds(
        [
          String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\UserChoice`,
          "    ProgId    REG_SZ    ggmail.mailto",
          "    Hash    REG_SZ    +74McxYCd8A=",
          "",
        ].join("\r\n"),
      ),
    ).toEqual(["ggmail.mailto"]);
  });

  test("reads the prog id out of the subkey Windows 11 24H2 writes", () => {
    expect(
      parseUserChoiceProgIds(
        [
          String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\UserChoiceLatest`,
          "    Hash    REG_SZ    9aiJBKu2x/s=",
          "",
          String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\UserChoiceLatest\ProgId`,
          "    ProgId    REG_SZ    ggmail.mailto",
          "    Hash    REG_SZ    abc=",
          "",
        ].join("\r\n"),
      ),
    ).toEqual(["ggmail.mailto"]);
  });

  test("ignores the padding around the value", () => {
    expect(
      parseUserChoiceProgIds("    ProgId    REG_SZ    Microsoft.Outlook.Mail.15    \r\n"),
    ).toEqual(["Microsoft.Outlook.Mail.15"]);
  });

  test("returns nothing when no value is there", () => {
    expect(parseUserChoiceProgIds("")).toEqual([]);
    expect(
      parseUserChoiceProgIds("ERROR: The system was unable to find the specified registry key"),
    ).toEqual([]);
  });
});
