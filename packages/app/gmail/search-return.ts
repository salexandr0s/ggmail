import type { WebContents } from "electron";

// The result list lives in a different WebContents from Gmail's own history.
let origin: { view: WebContents; index: number; returnToResults: () => void } | undefined;

function checkHistoryPosition() {
  if (origin && origin.view.navigationHistory.getActiveIndex() < origin.index) {
    forgetSearchOrigin();
  }
}

export function rememberSearchOrigin(view: WebContents, returnToResults: () => void) {
  forgetSearchOrigin();
  origin = {
    view,
    index: view.navigationHistory.getActiveIndex(),
    returnToResults,
  };
  // Gmail can replace the result URL with its canonical thread URL. The
  // history entry still leads back to search until the user moves past it.
  view.on("did-navigate-in-page", checkHistoryPosition);
}

export function forgetSearchOrigin(view?: WebContents) {
  if (origin && (!view || view === origin.view)) {
    origin.view.off("did-navigate-in-page", checkHistoryPosition);
    origin = undefined;
  }
}

export function canReturnToResults(view: WebContents) {
  return origin?.view === view && origin.index === view.navigationHistory.getActiveIndex();
}

export function goBack(view: WebContents) {
  if (origin && canReturnToResults(view)) {
    const { returnToResults } = origin;
    forgetSearchOrigin(view);
    returnToResults();
  } else {
    view.navigationHistory.goBack();
  }
}
