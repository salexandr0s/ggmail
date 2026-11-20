# ggmail

ggmail is a desktop app for Gmail. Switch between accounts, read messages in a unified inbox, browse attachments across mailboxes, and draft replies with the optional ChatGPT assistant.

## Build on Apple Silicon

With Bun, Node.js and the Apple Command Line Tools installed, run

```sh
bun install --frozen-lockfile --ignore-scripts
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run build:mac:local
```

Open `dist/mac-arm64/ggmail.app` and sign in to Gmail. ggmail uses its own account profile. See [local build notes](LOCAL-BUILD.md) for the app identity, signing details and test commands.

Gmail and its icon are trademarks of Google LLC. ggmail is an independent project.
