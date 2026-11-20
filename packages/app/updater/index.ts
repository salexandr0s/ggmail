// Modified 2026-11-19: never replace this custom build with vendor binaries.
// Security fixes must be reviewed and incorporated by rebuilding from source.
import { GITHUB_REPO_URL } from "@ggmail/shared/constants";
import { openExternalUrl } from "../url";

class AppUpdater {
  init() {}

  isUpdateSupported() {
    return false;
  }

  checkForUpdates({ isManualCheck = false }: { isManualCheck?: boolean } = {}) {
    if (isManualCheck) {
      this.openReleasePage();
    }
  }

  openReleasePage() {
    openExternalUrl(`${GITHUB_REPO_URL}/releases`);
  }

  quitAndInstall() {
    this.openReleasePage();
  }
}

export const appUpdater = new AppUpdater();
