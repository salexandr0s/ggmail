# ggmail

[Download ggmail for Mac with Apple silicon](https://github.com/salexandr0s/ggmail/releases/latest/download/ggmail-mac-arm64.dmg). Open the disk image and drag ggmail into Applications. Requires macOS 13 or later.

ggmail is a desktop app for Gmail. All Mail brings unread mail from all your accounts into one list. The Accounts list shows sync status and unread counts. Select an account to see its unread mail and due follow-ups, or choose **All accounts** to see them together. Select a message to open the conversation in its own account, or use `J` and `K` to move through the list and `Enter` to open it.

To find mail across accounts, press `/` to focus **Search all accounts**, enter a Gmail query such as `filename:pdf newer_than:30d` and press **Enter**. You can also choose a saved search in All Mail. Results appear as each mailbox responds. Use **All accounts** to narrow the list, or clear the search to return to unread mail. After opening a result, use **Back** to return to that row. Press **↓** and **Enter** to open the next conversation.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/unified-inbox-dark.png">
  <img src="docs/screenshots/unified-inbox-light.png" alt="All Mail shows unread conversations from Studio and Personal, with per-account counts and sync status in the sidebar.">
</picture>

_The screenshots use fictional mailboxes and files. The assistant conversation is an example._

## Follow up on sent mail

Open a sent conversation, then choose **Waiting for reply → Schedule follow-up**. On the scheduling page, choose **Follow up Friday** or pick a date. Saving returns you to the list, which shows the account, recipient, and last sent date. Due conversations also appear in All Mail once ggmail checks that nobody has replied.

## Read and compose in dark colors

Turn on **Settings → Gmail → Extend dark theme** to apply it to open messages, replies and compose windows immediately. Select **Original colors** above an email to see its sender’s design. Select it again to return to dark colors. Drafts keep the formatting you send.

## Find an attachment

Select **Attachments** in the title bar. In compact windows, choose it from **Mail views**. Search across filenames, senders, and subjects in any word order. Choose one category, such as Invoice or Receipt. You can combine it with one or more accounts and file types. Open **More filters** to narrow the results by sender, exact extension, received dates, or size. In a narrow window, open **Filters** for all of these options. Use the category beside each file to correct a match. Select a thumbnail or filename to preview the file in the library. The envelope opens the original email. **Back** returns to the file with your filters and scroll position restored. ggmail saves the file list per signed-in mailbox. After a restart, you can browse previously found files while it checks Gmail for changes.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/attachments-dark.png">
  <img src="docs/screenshots/attachments-light.png" alt="The attachment library shows nine files from two accounts. Categories and accounts appear in the sidebar, with file formats above the list and a category picker beside each filename.">
</picture>

## Draft a reply with the mail assistant

Open **Settings → AI** and choose **Claude Code CLI (Subscription)** to use the Claude Code account signed in on this computer. You can also connect a ChatGPT subscription or enter an API key for Claude, OpenAI, or DeepSeek.

Select **Mail assistant** in the title bar to search your signed-in mailboxes. The assistant can read a full conversation to find a deadline or prepare a reply. Select a citation to read its source in the sidebar. **Back to answer** returns to the same chat and its unfinished question. Your chosen provider receives your prompt and the relevant mail. Choose **Insert into reply** to place a draft in the open thread. Gmail fills in the recipients and keeps the reply ready for you to edit and send. You can also ask for revisions, copy the draft, or start a separate message with **Open in Gmail**.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/mail-assistant-dark.png">
  <img src="docs/screenshots/mail-assistant-light.png" width="450" alt="The mail assistant cites Maya’s proof email and drafts a reply asking her to correct the entrance on a poster before printing.">
</picture>

## Build on Apple Silicon

Install Bun 1.4, Node.js 24, and the Apple Command Line Tools. From the project directory, run

```sh
bun install --frozen-lockfile --ignore-scripts
DEVELOPER_DIR=/Library/Developer/CommandLineTools bun run install:mac:local
```

The install command requires ggmail’s Developer ID and opens the verified app in Applications. For a Mac without that identity, use the signed release download above. For test builds and signing details, see the [local build notes](LOCAL-BUILD.md).

Gmail and its icon are trademarks of Google LLC. ggmail is an independent project.
