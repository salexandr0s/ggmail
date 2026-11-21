import type { AssistantSender } from "@ggmail/shared/assistant";
import { getGoogleDomainFaviconUrl } from "@ggmail/shared/google";
import { Avatar, AvatarFallback, AvatarImage } from "@ggmail/ui/components/avatar";
import { useState } from "react";

export function SenderAvatar({
  sender,
  className,
}: {
  sender: AssistantSender;
  className: string;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string>();
  const photo = sender.photoUrl !== failedPhoto ? sender.photoUrl : undefined;
  const src = photo ?? (sender.domain && getGoogleDomainFaviconUrl(sender.domain, 32));
  const names = sender.name.trim().split(/\s+/u);
  const initials = [names[0], names.length > 1 ? names.at(-1) : ""]
    .map((part) => Array.from(part || "")[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <Avatar aria-hidden="true" className={className} title={sender.name}>
      {src && (
        <AvatarImage
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className={photo ? undefined : "bg-white object-contain p-px"}
          onLoadingStatusChange={(status) => {
            if (status === "error" && photo) {
              setFailedPhoto(photo);
            }
          }}
        />
      )}
      <AvatarFallback className="bg-muted text-[0.63em] font-semibold text-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
