# ggmail local build

The macOS bundle, executable and account profile are named `ggmail`. The bundle identifier is `com.github.salexandr0s.ggmail` and the app accepts `ggmail://` deep links. Sign in on first launch. Application updates are built manually from this repository.

## Build on Apple Silicon macOS

```sh
bun install --frozen-lockfile --ignore-scripts
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run build:mac:local
```

The build writes `dist/mac-arm64/ggmail.app` and verifies its ad-hoc signature. It requires no signing credentials.

On macOS, a profile migrated from Meru Local can reuse its existing Keychain entry.
For a profile that already uses that entry, quit the app and create an empty
`.meru-local-keychain` file in the ggmail profile directory before launching the new
build. The marker belongs only in profiles whose cookies were encrypted by Meru Local.

## Mail assistant

Select the sparkle button in the title bar and choose **Continue with ChatGPT**.
Complete sign-in in your browser and allow ggmail to use your ChatGPT plan.
Choose a model below the message field. The panel remembers your choice and
shows the active Gmail view and account in its header.

With an email open, the assistant reads its expanded messages. In Gmail's **All Mail**
view, it can search the selected account and use matching snippets. Open a source
and ask there for a full-message summary. In other Gmail lists it can use the
visible snippets. Switching views or accounts starts a fresh conversation.

Ask for a draft, then ask for changes to its wording or length. In an open thread, **Insert into reply** places the draft above any existing reply text. Gmail handles recipients and threading. Review the reply and send it when ready. You can also copy the body or choose **Open in Gmail** for a separate message.
**Stop reply** keeps the text received so far. **Try again** repeats the last
interrupted request and preserves anything you have typed for your next message.

When you ask a question, ggmail sends the chat and relevant mail context to
OpenAI. The chat stays in memory and clears when you close the panel or start a
new chat. Electron's protected storage keeps the ChatGPT connection on this device.

## Attachments

Choose **View → Attachments** or click the paperclip in the title bar. Search by filename,
sender or subject. Choose a file type or account in the sidebar, or open **Filters** in a
narrow window. Switch between list and grid with the controls beside the sort menu.
Select a row or card to preview its file in the library. Gmail supplies thumbnails when available. The envelope opens its conversation, and the
download button uses your normal download settings.

The library loads older mail while the view is open and keeps its file list in memory
for the current mailbox session. **Refresh attachments** checks for new or removed files.

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

The app is ad-hoc signed locally, not Apple-notarized or vendor-signed. Both main and helper
processes carry the per-app disable-library-validation entitlement needed to load their
ad-hoc-signed Electron framework and native addon. DYLD environment-variable access is not
entitled. System-wide Gatekeeper and other macOS security settings are left unchanged.

Cookie encryption is enabled in the local Electron build. Normal macOS Keychain, camera,
microphone and screen-sharing consent prompts are not suppressed.
