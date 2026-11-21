# Changelog

## 3.65.9 — 2026-11-21

- The mail assistant shows the selected account’s profile photo beside its name in the current mail view and open email headers.

## 3.65.8 — 2026-11-21

- The workspace sidebar now has Mail, Calendar, Google Tasks and Google Meet at the top. Bookmarks sits above the divider over Settings.
- Document covers fill the attachment card width and show the top of the page. File-type filters now select one type at a time.

## 3.65.7 — 2026-11-21

- The Attachments grid can render image and PDF covers when Gmail supplies a placeholder. Filenames have a fixed two-line slot so details and actions align on every card.
- Selecting a category in Attachments switches the filter immediately.

## 3.65.6 — 2026-11-21

- Account tabs and Settings now load Google profile photos served through an account-specific redirect.

## 3.65.5 — 2026-11-21

- Mac updates installed with `bun run install:mac:local` use the same Developer ID as the release, so Keychain can recognize ggmail across updates.
- Account tabs and Settings show each mailbox's Google profile photo. The narrower navigation and refreshed Follow-ups, Attachments and Settings pages share Gmail's light and dark colours.
- The mail assistant shows provider logos, available models and supported reasoning levels in its picker.

## 3.65.4 — 2026-11-21

- Calendar opens as a tab in the main ggmail window. Choose a mailbox when opening Calendar, or switch accounts from the title bar while viewing it. Each mailbox keeps its own Calendar page.
- All Mail shows per-account unread counts and sync status. This release also updates Attachments, Waiting for reply, mail navigation, and Settings.

## 3.65.3 — 2026-11-21

- Open Calendar from the title bar or Mail views to see the selected account’s Google Calendar full screen. Reopening Calendar brings its existing window forward.
- Mail assistant answers display linked images, recognize citation ranges, and show sender photos or domain icons alongside sources.

## 3.65.2 — 2026-11-21

- Settings groups pages under Application, Mail, and System. Related controls share panels, dropdown arrows sit at the right edge, and long selections wrap in narrow windows.
- The attachment library remembers indexed files across launches, recognizes more document categories, and preserves manual category choices.
- Compact mail navigation and dropdown menus work more consistently across window sizes.

## 3.65.1 — 2026-11-21

- Reopening the mail assistant in the same mail view restores the conversation and unsent text. Replies can finish while the sidebar is closed. Use **New chat** to start over.
- Fixed a sidebar bug that let a background mailbox cover the assistant when multiple accounts were open.

## 3.65.0 — 2026-11-21

### Added

- Browse attachments across your Gmail accounts, search by file or sender, and preview, download, or open the original email.

- Use the mail assistant with ChatGPT, Claude Code, Claude API, OpenAI API or DeepSeek. It can search across signed-in accounts, read full conversations and insert a draft into an open reply.

### Changed

- ggmail now has its own application identity, URL scheme and account profile.
- The assistant sidebar slides alongside Gmail. Answers stream as they arrive, with progress updates showing which mailbox or conversation the assistant is reading.
