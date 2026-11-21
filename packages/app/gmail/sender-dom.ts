import { z } from "zod";

export const gmailSenderSchema = z.object({
  name: z.string().max(320),
  address: z.string().max(320),
  photo: z.string().max(2048),
});

// Fixed readers used inside Gmail's isolated world. Only inspect sender headers.
export const readSender = String.raw`(el, img) => ({
  name: (el?.getAttribute("name") || el?.textContent || "").trim().slice(0, 320),
  address: (el?.getAttribute("email") || "").trim().slice(0, 320),
  photo: (img?.currentSrc || img?.src || "").slice(0, 2048),
})`;

export const readRowSenders = String.raw`(row) => {
  const authors = Array.from(row.querySelectorAll(".yW[email], .yW [email]")).slice(0, 8);
  return authors.map(el => (${readSender})(el, el.querySelector("img") ??
    (authors.length === 1 ? row.querySelector(".yW img") : null)));
}`;
