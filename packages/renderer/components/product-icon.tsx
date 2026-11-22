import type { ComponentProps } from "react";

export type ProductIconProps = ComponentProps<"svg">;

// The button or menu item supplies the name in the shell. A standalone mark
// can also be named directly with either of the standard SVG labelling props.
export function ProductIcon(props: ProductIconProps) {
  const named = Boolean(props["aria-label"] || props["aria-labelledby"]);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      focusable="false"
      aria-hidden={named ? undefined : true}
      role={named ? "img" : undefined}
      {...props}
    />
  );
}

export function IconGradient({ id, light, dark }: { id: string; light: string; dark: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="15%" y1="100%" x2="82%" y2="0%">
        <stop stopColor={dark} />
        <stop offset="1" stopColor={light} />
      </linearGradient>
    </defs>
  );
}
