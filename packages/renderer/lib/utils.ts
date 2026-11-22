export const platform = {
  isMacOS: window.electron.process.platform === "darwin",
  isWindows: window.electron.process.platform === "win32",
  isLinux: window.electron.process.platform === "linux",
};

export function normalizeSearchText(text: string, locale: string) {
  return text.trim().toLocaleLowerCase(locale).normalize("NFD").replace(/\p{M}/gu, "");
}
