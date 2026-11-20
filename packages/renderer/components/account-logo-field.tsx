import type { AccountConfig } from "@ggmail/shared/schemas";
import { Button } from "@ggmail/ui/components/button";
import { Field, FieldError, FieldLabel } from "@ggmail/ui/components/field";
import { Trans, useLingui } from "@lingui/react/macro";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

// A 16px tab icon at up to 3× display density.
const LOGO_MAX_EDGE = 48;

async function resizeLogo(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) {
      throw new Error("Image has no dimensions");
    }

    const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not create logo canvas");
    }

    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AccountLogoField({
  logo,
  onChange,
  loading,
  onLoadingChange,
}: {
  logo: AccountConfig["logo"];
  onChange: (logo: string | null) => void;
  loading: boolean;
  onLoadingChange: (loading: boolean) => void;
}) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const chooseImage = t`Choose image`;

  return (
    <Field>
      <FieldLabel htmlFor="account-logo">
        <Trans>Logo</Trans>
      </FieldLabel>
      <div className="flex gap-2" aria-busy={loading}>
        <input
          ref={inputRef}
          id="account-logo"
          type="file"
          accept="image/*"
          hidden
          disabled={loading}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) {
              return;
            }

            onLoadingChange(true);
            setFailed(false);
            try {
              onChange(await resizeLogo(file));
            } catch {
              setFailed(true);
            } finally {
              onLoadingChange(false);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size={logo ? "icon" : "default"}
          disabled={loading}
          title={chooseImage}
          aria-label={chooseImage}
          onClick={() => inputRef.current?.click()}
        >
          {logo ? (
            <img src={logo} alt="" className="size-5 object-contain" />
          ) : (
            <>
              <ImagePlusIcon />
              {chooseImage}
            </>
          )}
        </Button>
        {logo && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={loading}
            title={t`Remove logo`}
            onClick={() => {
              onChange(null);
              setFailed(false);
            }}
          >
            <XIcon />
          </Button>
        )}
      </div>
      {failed && (
        <FieldError>
          <Trans>Couldn’t read this image. Try another file.</Trans>
        </FieldError>
      )}
    </Field>
  );
}
