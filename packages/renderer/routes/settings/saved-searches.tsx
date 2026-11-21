import { move } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  type GmailSavedSearch,
  type GmailSavedSearchInput,
  gmailSavedSearchInputSchema,
} from "@ggmail/shared/schemas";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ggmail/ui/components/alert-dialog";
import { Button } from "@ggmail/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@ggmail/ui/components/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@ggmail/ui/components/field";
import { Input } from "@ggmail/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@ggmail/ui/components/item";
import { Trans, useLingui } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { BookmarkIcon, GripVerticalIcon, PencilIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { EmojiPickerButton } from "@/components/emoji-picker-button";
import { SettingsContent, SettingsHeader, SettingsTitle } from "@/components/settings";
import { SettingsDialogContent } from "@/components/settings-dialog-content";
import { useConfig, useConfigMutation } from "@/lib/react-query";
import { settingsPageLabels } from "@/lib/settings-pages";

export function SavedSearchForm({
  savedSearch = { label: "", query: "" },
  labelPlaceholder,
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- a Gmail search query, whose operators Gmail reads only in English
  queryPlaceholder = "label:friends is:unread",
  type,
  onSubmit,
}: {
  savedSearch?: GmailSavedSearchInput;
  labelPlaceholder?: string;
  queryPlaceholder?: string;
  type: "add" | "edit";
  onSubmit: (savedSearch: GmailSavedSearchInput) => void;
}) {
  const { t } = useLingui();

  const schema = useMemo(
    () =>
      gmailSavedSearchInputSchema.extend({
        label: z.string().min(
          1,
          t({
            message: "Enter a label",
            context: "saved search",
            comment:
              "Error under the empty Label field, which takes the name ggmail shows for the saved search",
          }),
        ),
        query: z.string().min(1, t`Enter a search query`),
      }),
    [t],
  );

  const form = useForm({
    defaultValues: savedSearch,
    validators: {
      onSubmit: schema,
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();

        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="label">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                <Trans comment="Field for the name ggmail shows for the saved search">Label</Trans>
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={
                    labelPlaceholder ??
                    t({
                      message: "Friends",
                      comment: "Example of a saved search's label, shown in the empty Label field",
                    })
                  }
                />
                <EmojiPickerButton
                  onEmojiSelect={({ emoji }) => {
                    form.setFieldValue("label", `${form.getFieldValue("label")}${emoji}`);
                  }}
                  modal
                />
              </div>
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
        <form.Field name="query">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>
                <Trans comment="Field for the Gmail search the saved search runs">Query</Trans>
              </FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder={queryPlaceholder}
              />
              <FieldError errors={field.state.meta.errors} />
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose
          render={
            <Button variant="outline">
              <Trans>Cancel</Trans>
            </Button>
          }
        />
        <Button type="submit">
          {type === "add" ? (
            <Trans comment="Button that adds the saved search in the dialog">Add</Trans>
          ) : (
            <Trans comment="Button that saves the saved search's changes in the dialog">Save</Trans>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddSavedSearchButton({
  onAdd,
}: {
  onAdd: (savedSearch: GmailSavedSearchInput) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button
            onClick={() => {
              setIsDialogOpen(true);
            }}
          >
            <Trans comment="Button that opens the dialog for adding a saved search">Add</Trans>
          </Button>
        }
      />
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Add saved search</Trans>
          </DialogTitle>
        </DialogHeader>
        <SavedSearchForm
          type="add"
          onSubmit={(values) => {
            onAdd(values);

            setIsDialogOpen(false);
          }}
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

function EditSavedSearchButton({
  savedSearch,
  onEdit,
}: {
  savedSearch: GmailSavedSearch;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { t } = useLingui();

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        render={
          <Button size="icon" className="size-8 p-0" variant="outline" title={t`Edit saved search`}>
            <PencilIcon />
          </Button>
        }
      />
      <SettingsDialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Edit saved search</Trans>
          </DialogTitle>
        </DialogHeader>
        <SavedSearchForm
          savedSearch={savedSearch}
          onSubmit={(values) => {
            onEdit({
              ...savedSearch,
              ...values,
            });

            setIsDialogOpen(false);
          }}
          type="edit"
        />
      </SettingsDialogContent>
    </Dialog>
  );
}

function SortableSavedSearchItem({
  savedSearch,
  index,
  onDelete,
  onEdit,
}: {
  savedSearch: GmailSavedSearch;
  index: number;
  onDelete: () => void;
  onEdit: (editedSavedSearch: GmailSavedSearch) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: savedSearch.id, index });

  const { t } = useLingui();

  const { label } = savedSearch;

  return (
    <Item ref={ref} className={isDragging ? "opacity-50" : undefined} variant="muted">
      <Button
        ref={handleRef}
        size="icon"
        className="size-8 cursor-grab touch-none p-0"
        variant="ghost"
        aria-label={t`Drag ${label} to reorder`}
      >
        <GripVerticalIcon />
      </Button>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        <ItemDescription>{savedSearch.query}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <EditSavedSearchButton savedSearch={savedSearch} onEdit={onEdit} />
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                size="icon"
                className="size-8 p-0"
                variant="outline"
                title={t`Delete saved search`}
              >
                <TrashIcon />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <Trans>Delete {label}?</Trans>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <Trans>This deletes the saved search, not the mail it finds.</Trans>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Trans>Cancel</Trans>
              </AlertDialogCancel>
              <AlertDialogClose
                render={<AlertDialogAction variant="destructive" />}
                onClick={onDelete}
              >
                <Trans>Delete saved search</Trans>
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}

export function SavedSearchesSettings() {
  const { config } = useConfig();

  const configMutation = useConfigMutation();

  const { t } = useLingui();

  if (!config) {
    return;
  }

  return (
    <>
      <SettingsHeader>
        <SettingsTitle>{t(settingsPageLabels.savedSearches)}</SettingsTitle>
        <AddSavedSearchButton
          onAdd={(savedSearch) => {
            configMutation.mutate({
              "gmail.savedSearches": [
                ...config["gmail.savedSearches"],
                {
                  id: crypto.randomUUID(),
                  ...savedSearch,
                },
              ],
            });
          }}
        />
      </SettingsHeader>
      <SettingsContent>
        {config["gmail.savedSearches"].length === 0 && (
          <div className="settings-empty">
            <BookmarkIcon aria-hidden="true" className="size-6" />
            <p>
              <Trans>No saved searches yet.</Trans>
            </p>
          </div>
        )}
        <DragDropProvider
          onDragEnd={(event) => {
            if (event.canceled) {
              return;
            }

            configMutation.mutate({
              "gmail.savedSearches": move(config["gmail.savedSearches"], event),
            });
          }}
        >
          <ItemGroup>
            {config["gmail.savedSearches"].map((savedSearch, index) => (
              <SortableSavedSearchItem
                key={savedSearch.id}
                savedSearch={savedSearch}
                index={index}
                onDelete={() => {
                  const deleteSavedSearchId = savedSearch.id;

                  configMutation.mutate({
                    "gmail.savedSearches": config["gmail.savedSearches"].filter(
                      (savedSearch) => savedSearch.id !== deleteSavedSearchId,
                    ),
                  });
                }}
                onEdit={(editedSavedSearch) => {
                  configMutation.mutate({
                    "gmail.savedSearches": config["gmail.savedSearches"].map((savedSearch) =>
                      savedSearch.id === editedSavedSearch.id ? editedSavedSearch : savedSearch,
                    ),
                  });
                }}
              />
            ))}
          </ItemGroup>
        </DragDropProvider>
      </SettingsContent>
    </>
  );
}
