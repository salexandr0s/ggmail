import { getGoogleProfilePhotoUrl } from "@ggmail/shared/google";
import { ipc } from "@ggmail/shared/renderer/ipc";

const accountControlSelector = [
  'a[href*="accounts.google.com/SignOutOptions"]',
  'a[href*="accounts.google.com/AccountChooser"]',
  '[aria-label*="@"][role="button"]',
  'a[aria-label*="@"]',
].join(",");
const accountImages = `:is(${accountControlSelector}) :is(img, svg image), img.gb_P, img.gbii`;

let lastEmail: string | undefined;
let lastPhoto: string | null = null;

export function setUserEmail() {
  if (location.hostname !== "mail.google.com") {
    return;
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="og-profile-acct"]');
  const email = meta?.content.trim() || undefined;

  // Only the Google bar identifies this account. Images in conversations and
  // the account-switcher iframe belong to other people.
  const bar =
    document.getElementById("gb") ??
    document.querySelector('header[role="banner"], [role="banner"]');
  let photo: string | null = null;
  for (const image of bar?.querySelectorAll<HTMLImageElement | SVGImageElement>(accountImages) ??
    []) {
    const source =
      image instanceof HTMLImageElement ? image.currentSrc || image.src : image.href.baseVal;
    const url = URL.parse(source, document.baseURI);
    const allowed = url && getGoogleProfilePhotoUrl(url.href);
    if (allowed) {
      photo = allowed;
      break;
    }
  }
  if (email === lastEmail && photo === lastPhoto) {
    return;
  }
  lastEmail = email;
  lastPhoto = photo;
  if (email) {
    meta?.setAttribute("data-ggmail-user-email", "");
  }
  ipc.main.send("gmail.setUserEmail", email, photo);
}

// Google can populate or replace the src on an existing avatar after the bar mounts.
document.addEventListener(
  "load",
  (event) => {
    if (
      (event.target instanceof HTMLImageElement || event.target instanceof SVGImageElement) &&
      event.target.closest('#gb, [role="banner"]')
    ) {
      setUserEmail();
    }
  },
  true,
);
