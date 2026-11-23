/* oxlint-disable lingui/no-unlocalized-strings -- Email and application link formats. */
export function createGgmailMessageUrl(owner: string, messageId: string) {
  return `ggmail://${owner}/message/${messageId}`;
}

export function gmailMessageWebUrl(owner: string, messageId: string, delegatedId?: string | null) {
  const delegatedPath = delegatedId ? "/d/" + encodeURIComponent(delegatedId) : "";
  return (
    "https://mail.google.com/mail/u/" +
    encodeURIComponent(owner) +
    delegatedPath +
    "/#all/" +
    messageId
  );
}
