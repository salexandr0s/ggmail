import { ms } from "@ggmail/shared/ms";

const NEW_EMAIL_SOUND_QUIET_PERIOD = ms("5s");

export function shouldPlayNewEmailSound(now: number, lastNewEmailNotificationAt?: number) {
  return (
    lastNewEmailNotificationAt === undefined ||
    now - lastNewEmailNotificationAt >= NEW_EMAIL_SOUND_QUIET_PERIOD
  );
}
