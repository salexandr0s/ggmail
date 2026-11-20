# ggmail

ggmail is a desktop app for Gmail. The unified inbox brings unread mail from all your accounts into one list. Select a message to open the conversation in its own account, or use `J` and `K` to move through the list and `Enter` to open it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/unified-inbox-dark.png">
  <img src="docs/screenshots/unified-inbox-light.png" alt="Unified inbox with ten unread messages. Teal Studio and violet Personal badges identify each message’s account.">
</picture>

*The screenshots use fictional mailboxes and files. The assistant conversation is an example.*

## Find an attachment

Select the paperclip or open **View → Attachments**. Search by filename, sender, or subject, then narrow the results by account or file type. Select a card to preview the file in Gmail, or use its envelope button to open the original email.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/attachments-dark.png">
  <img src="docs/screenshots/attachments-light.png" alt="Eight attachments in grid view, including a poster proof, a table layout, and a weekend itinerary. The sidebar lists file types and accounts.">
</picture>

## Draft a reply with ChatGPT

With an email open, select the sparkle in the title bar and choose **Continue with ChatGPT**. When you ask a question, ggmail sends the prompt and relevant mail context to OpenAI. You can ask for revisions, copy the draft, or choose **Open in Gmail** to review and send it yourself.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/mail-assistant-dark.png">
  <img src="docs/screenshots/mail-assistant-light.png" width="450" alt="The mail assistant cites Maya’s proof email and drafts a reply asking her to correct the entrance on a poster before printing.">
</picture>

## Build on Apple Silicon

Install Bun 1.4, Node.js 24, and the Apple Command Line Tools. From the project directory, run

```sh
bun install --frozen-lockfile --ignore-scripts
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run build:mac:local
open dist/mac-arm64/ggmail.app
```

Sign in to Gmail on first launch. ggmail uses its own account profile. For signing details and verification commands, see the [local build notes](LOCAL-BUILD.md).

Gmail and its icon are trademarks of Google LLC. ggmail is an independent project.
