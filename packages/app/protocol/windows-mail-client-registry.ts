// Pure text in and out, kept apart from the module that runs `reg.exe` so a
// unit test needs no Electron

export const MAILTO_PROG_ID = "ggmail.mailto";

export const BROWSER_PROG_ID = "ggmail.url";

function escapeRegValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildRegistration(executablePath: string) {
  const icon = escapeRegValue(`${executablePath},0`);

  const openCommand = escapeRegValue(`"${executablePath}"`);

  const urlCommand = escapeRegValue(`"${executablePath}" "%1"`);

  // The leading `-` deletes `Software\ggmail`, the second set of capabilities
  // earlier installers wrote: left behind, Default apps lists two ggmails
  const registration = String.raw`Windows Registry Editor Version 5.00

[-HKEY_CURRENT_USER\Software\ggmail]

[HKEY_CURRENT_USER\Software\Classes\ggmail.mailto]
@="ggmail URL"
"FriendlyTypeName"="ggmail URL"
"EditFlags"=dword:00000002

[HKEY_CURRENT_USER\Software\Classes\ggmail.mailto\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Classes\ggmail.mailto\shell\open\command]
@=${urlCommand}

[HKEY_CURRENT_USER\Software\Classes\mailto]
"URL Protocol"=""

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail]
@="ggmail"
"LocalizedString"="ggmail"

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\shell\open\command]
@=${openCommand}

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Protocols\mailto]
@="URL:MailTo Protocol"
"URL Protocol"=""
"EditFlags"=dword:00000002

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Protocols\mailto\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Protocols\mailto\shell\open\command]
@=${urlCommand}

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Capabilities]
"ApplicationName"="ggmail"
"ApplicationDescription"="The Gmail experience you deserve"
"ApplicationIcon"=${icon}

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Capabilities\StartMenu]
"Mail"="ggmail"

[HKEY_CURRENT_USER\Software\Clients\Mail\ggmail\Capabilities\URLAssociations]
"mailto"="ggmail.mailto"

[HKEY_CURRENT_USER\Software\Classes\ggmail.url]
@="ggmail Web Link"
"FriendlyTypeName"="ggmail Web Link"
"EditFlags"=dword:00000002

[HKEY_CURRENT_USER\Software\Classes\ggmail.url\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Classes\ggmail.url\shell\open\command]
@=${urlCommand}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail]
@="ggmail"
"LocalizedString"="ggmail"

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\DefaultIcon]
@=${icon}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\shell\open\command]
@=${openCommand}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\Capabilities]
"ApplicationName"="ggmail"
"ApplicationDescription"="The Gmail experience you deserve"
"ApplicationIcon"=${icon}

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\Capabilities\StartMenu]
"StartMenuInternet"="ggmail"

[HKEY_CURRENT_USER\Software\Clients\StartMenuInternet\ggmail\Capabilities\URLAssociations]
"http"="ggmail.url"
"https"="ggmail.url"

[HKEY_CURRENT_USER\Software\RegisteredApplications]
"ggmail"="Software\\Clients\\Mail\\ggmail\\Capabilities"
"ggmail.url"="Software\\Clients\\StartMenuInternet\\ggmail\\Capabilities"
`;

  // `reg.exe import` parses the file as Windows text
  return registration.replace(/\n/g, "\r\n");
}

/**
 * Every `REG_SZ` value in a `reg query` dump except the hash. Windows 11 24H2
 * moved the choice from a `ProgId` value on `UserChoice` to a `ProgId` subkey
 * of `UserChoiceLatest`, so the value's name is not relied on, only its data.
 */
export function parseUserChoiceProgIds(output: string) {
  return [...output.matchAll(/^\s*(?!Hash\s)\S+\s+REG_SZ\s+(\S.*?)\s*$/gm)].map(
    (match) => match[1],
  );
}
