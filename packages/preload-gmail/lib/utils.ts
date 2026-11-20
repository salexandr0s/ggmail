export function createElementAttributeFromPreloadArgument(preloadArgument: string) {
  return preloadArgument.replace("--", "data-");
}

export function createNotMatchingAttributeSelector(selector: string, attribute: string) {
  return `${selector}:not([${attribute}])`;
}

export function reEmitClickWithShiftKey(element: Element) {
  element.addEventListener("click", (event) => {
    // Only redirect a user's click. The assistant explicitly opens an inline
    // reply, and the synthetic Shift-click below already has its destination.
    if (!event.isTrusted) {
      return;
    }

    event.stopPropagation();

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        shiftKey: true,
      }),
    );
  });
}
