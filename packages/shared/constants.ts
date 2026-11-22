export const APP_ID = "com.github.salexandr0s.ggmail";

export const BASE_SPACING = 8;

export const APP_TITLEBAR_HEIGHT = BASE_SPACING * 6;

export const WORKSPACE_SIDEBAR_WIDTH = 52;

export function workspaceSidebarWidth(windowWidth: number) {
  return windowWidth <= 640 ? 44 : WORKSPACE_SIDEBAR_WIDTH;
}

export const GOOGLE_ACCOUNTS_URL = "https://accounts.google.com";

export const GOOGLE_MEET_URL = "https://meet.google.com";

export const GITHUB_REPO_URL = "https://github.com/salexandr0s/ggmail";

export const MAX_RECENT_DOWNLOAD_HISTORY_ITEMS = 10;
