# ggmail local build

The macOS bundle, executable and account profile are named `ggmail`. The bundle identifier is `com.github.salexandr0s.ggmail` and the app accepts `ggmail://` deep links. Sign in on first launch. Application updates are built manually from this repository.

## Build on Apple Silicon macOS

```sh
bun install --frozen-lockfile --ignore-scripts
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run install:mac:local
```

The install command builds `dist/mac-arm64/ggmail.app` with the release team's Developer ID Application certificate. It verifies the staged copy, quits the installed app, replaces its bundle and opens it again. The account profile and its persistent partitions live in Application Support. The same Developer ID lets Keychain recognize the updated app when opening encrypted cookies. To build without installing, run `bun run build:mac:local`.

For development on a Mac without that certificate, `bun run build:mac:local --adhoc` writes a test bundle under `dist/adhoc/mac-arm64/`. Launch test bundles with a separate `--user-data-dir`. The GitHub Actions artifact is an ad-hoc intermediate used for verification and release signing. Use the Developer ID-signed download from Releases for an existing account profile.

To build the downloadable Apple Silicon disk image with a Developer ID Application certificate, run `bun run build:mac:dmg`. It writes `dist/ggmail-mac-arm64.dmg`. Set `APPLE_KEYCHAIN_PROFILE` to a configured notarytool profile to notarize the app during packaging.

On macOS, a profile migrated from Meru Local can reuse its existing Keychain entry.
For a profile that already uses that entry, quit the app and create an empty
`.meru-local-keychain` file in the ggmail profile directory before launching the new
build. The marker belongs only in profiles whose cookies were encrypted by Meru Local.

## Mail assistant

Open **Settings → AI** and select a mail assistant provider.

- **Claude Code CLI (Subscription)** uses the local Claude Code installation. Sign in with `claude auth login` if needed, then select **Use Claude Code session**. Disconnecting removes the link in ggmail and leaves the terminal session available.
- **OpenAI Subscription (ChatGPT)** uses the existing browser sign-in. Select **Continue with ChatGPT** and allow plan access.
- **Claude API**, **OpenAI API**, and **DeepSeek AI** each take their own provider's API key. ggmail verifies the key by loading the available models and encrypts the key on this device.

Open the mail assistant using the **Mail assistant** button in the title bar.
Choose a model below the message field. The panel remembers your choice and
shows the active Gmail view and account in its header.

From the inbox, an open thread, or All Mail, ask the assistant to find a message or check a deadline. It can search signed-in accounts, read the messages in a conversation, and open a cited thread in its original mailbox. You can name a specific account or ask it to search all accounts. Switching Gmail views or accounts starts a fresh conversation.

Ask for a draft, then ask for changes to its wording or length. In an open thread, **Insert into reply** places the draft above any existing reply text. Gmail handles recipients and threading. Review the reply and send it when ready. You can also copy the body or choose **Open in Gmail** for a separate message.
**Stop reply** keeps the text received so far. **Try again** repeats the last
interrupted request and preserves anything you have typed for your next message.

When you ask a question, ggmail sends the chat and relevant mail context to
the selected provider. You can close the sidebar and reopen it in the same mail view to pick up where you left off, including an unfinished message or a reply still coming in. **New chat** clears the conversation. Chat history stays in memory for this app session and clears when you switch providers. Electron's protected storage keeps the ChatGPT connection on this device.

## Workspace sidebar

The sidebar keeps Mail, Calendar, Google Tasks and Google Meet in the same order on every mail view. Bookmarks sits at the bottom, above the separator and Settings gear. Calendar, Tasks and Meet open for the selected mailbox. Switch mailboxes in the title bar to switch accounts within these apps. Reopening a shortcut returns to its existing tab. Each shortcut follows your Workspace preference for opening that app in the default browser.

## Attachments

Choose **View → Attachments**, select **Attachments** in the title bar, or open it from **Mail views** in a compact window. Search across filenames, senders and subjects. Words can appear in any order and in different fields. Enclose a phrase in quotation marks to keep its words together.

Choose one category, one file type and any number of accounts. For example, select **Receipt** and **PDF** to see PDF receipts. Choosing **Invoice** next switches to PDF invoices. The count beside each option reflects the other filters. Open **More filters** to enter a sender’s name or email, choose an exact extension, set either or both received dates, or select a size range. Both dates include the whole day in your local time zone. Size ranges use the size Gmail displays.

In a narrow window, open **Filters** for all controls and the live result count. Remove an active filter with its × button or choose **Clear filters** to clear the search and all selections. Switch between list and grid with the controls beside the sort menu.

Select a row or card to preview its file in the library. The grid loads Gmail thumbnails as cards come into view. If Gmail has no usable thumbnail, ggmail can generate one from an image or, on Mac, the first page of a PDF. Local cover generation reads up to 12 MiB per file. The envelope opens its conversation, and the
download button uses your normal download settings.

ggmail recognizes invoices, receipts, contracts, tickets, reservations, bank statements, orders and price quotes in English, German, Spanish, Greek, Italian and French. Detection runs locally using document names and common numbered exports. For example, “Reçu de paiement pour la facture 429” is a receipt referring to an invoice. A file can have several categories. “Web Booking eTicket” appears when you select either Ticket or Reservation. A receipt referring to an invoice stays under Receipt. When filenames are generic, the library looks for text that names the individual file, even when several documents arrive together. An explicit enclosure description can identify a single document. Paired details such as an amount paid and a transaction reference can also identify a receipt. Detection uses the email metadata already loaded by the library. The library also checks the subject when it belongs to a single-message thread with one document. Unclear or insufficient evidence leaves the file under **Uncategorized**. Add or remove categories on a row or card, or choose **Automatic** to restore detection. Manual choices stay on this device across refreshes and restarts.

The library saves file metadata on this device as it discovers each conversation. When you reopen it, each signed-in mailbox restores its saved files and checks Gmail for new, changed or removed conversations. This version also updates automatic categories for recognizable saved filenames locally. It keeps manual choices and earlier message-based categories for generic filenames. You can search and filter those files while the check runs. Previews and downloads still use Gmail. **Retry** checks unfinished mail, and **Refresh attachments** rechecks the mailbox. Removing an account clears its saved index.

## Verification

```sh
bun audit
bun run lint
bun run types
bun run test
codesign --verify --deep --strict dist/mac-arm64/ggmail.app
```

Use `bun run test:e2e --config=playwright.local.config.ts` for the packaged local UI suite. It launches temporary account profiles.

## Signing and privacy

Both the installed executable and its nested helpers are code signed. The installer verifies the Apple certificate chain, Developer ID team and ggmail bundle identifier before it quits the running app.

Cookie encryption is enabled in the local Electron build. Normal macOS Keychain, camera,
microphone and screen-sharing consent prompts are not suppressed.
