import { createHash } from "node:crypto";
import {
  isAttachmentCategory,
  isCategorySelection,
  normalizeAttachmentCategories,
  type AttachmentCategory,
} from "@ggmail/shared/attachments";
import { CachedStore } from "@/lib/cached-store";

type Overrides = Record<string, AttachmentCategory | AttachmentCategory[]>;
let store: CachedStore<Record<string, Overrides>> | undefined;

function categoryStore() {
  return (store ??= new CachedStore<Record<string, Overrides>>({
    name: "attachment-categories",
    accessPropertiesByDotNotation: false,
  }));
}

export function clearAttachmentCategories(accountId?: string) {
  const categories = categoryStore();
  if (accountId === undefined) {
    categories.clear();
  } else {
    categories.delete(accountId);
  }
}

// Only mailbox fingerprints, part IDs and explicit choices go on disk.
export class AttachmentCategoryOverrides {
  readonly mailboxKey: string;
  private values: Overrides;

  constructor(
    private accountId: string,
    mailbox: string,
    email: string | null,
  ) {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- Node hash algorithm.
    this.mailboxKey = createHash("sha256")
      .update(JSON.stringify([accountId, mailbox, email?.toLowerCase() ?? null]))
      .digest("hex");
    this.values = categoryStore().get(accountId) ?? {};
  }

  get(fileId: string) {
    const category = this.values[this.mailboxKey + "/" + fileId];
    if (isAttachmentCategory(category)) {
      return [category]; // Single choices saved by earlier versions.
    }
    return isCategorySelection(category) ? normalizeAttachmentCategories(category) : undefined;
  }

  set(fileId: string, category: AttachmentCategory[] | null) {
    const categories = categoryStore();
    const values = categories.get(this.accountId) ?? {};
    const key = this.mailboxKey + "/" + fileId;
    if (category === null) {
      delete values[key];
    } else {
      values[key] = category;
    }
    if (Object.keys(values).length) {
      categories.set(this.accountId, values);
    } else {
      categories.delete(this.accountId);
    }
    this.values = values;
  }
}
