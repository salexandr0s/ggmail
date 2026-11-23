# Changelog

## Unreleased

- Right-click a message or selected text for mail actions, **Add to Tasks**, **Add to Calendar** and **Quote to assistant**. Selected text can be saved to Google Tasks from a draft window, and quoted passages attach to your next assistant prompt.
- Removing an account switches to the next one before its saved data is cleared. The dock badge and tray count update when an account is removed or turned off.
- All Mail sorts by received time. If a conversation cannot be opened or a row action is refused, All Mail stays in place and says so.
- Menus, dialogs and search fields share one focus ring. Menus in dark mode show a visible highlight on the hovered row.
- The find bar counter turns red when nothing matches. Removing a follow-up dims only that row.
- **Insert into reply** in the mail assistant puts the draft into the Gmail reply again. If a draft cannot be inserted, the assistant says so and suggests copying it.
- The mail assistant can search the web for public details, such as a business's contact address, with OpenAI, ChatGPT and Claude models. It shows what it is searching for and links the pages it used. DeepSeek models answer from mail alone. Turn it off with **Search the web** in **Settings → AI**.
- A draft for a new email lists its recipients. **Open in Gmail** fills in the recipients, subject and message together, and the draft card has a copy button for each.

## 3.65.10 — 2026-11-22

- Docs, Drive and Sheets join the default sidebar. Add, remove and reorder shortcuts in **Settings → Sidebar**. Settings stays pinned at the bottom.
- The sidebar and titlebar launcher share a drag-and-drop picker. Workspace and mail icons are easier to distinguish in compact windows.
- All Mail, Attachments and Waiting for reply adapt to smaller windows. Attachment filters include sender, file extension, date and size.
- The mail assistant keeps its conversation when you change mailboxes or mail views. Notification settings let you choose when mail alerts appear.

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
