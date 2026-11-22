import { ProductIcon, type ProductIconProps } from "./product-icon";

export function BookmarksIcon(props: ProductIconProps) {
  return (
    <ProductIcon {...props}>
      <path
        fill="#669DF6"
        d="M8.1 1.1h11.3a1.9 1.9 0 0 1 1.9 1.9v14.6l-2.7-1.7V7.5a3.5 3.5 0 0 0-3.5-3.5H6.2V3a1.9 1.9 0 0 1 1.9-1.9Z"
      />
      <path
        fill="#4285F4"
        d="M4.5 5.5h10.7a2 2 0 0 1 2 2v14.6c0 .6-.6.9-1.1.6l-6.2-4-6.3 4c-.5.3-1.1 0-1.1-.6V7.5a2 2 0 0 1 2-2Z"
      />
      <path fill="#1967D2" d="m9.9 18.7 7.3-5.7v9.1c0 .6-.6.9-1.1.6Z" />
    </ProductIcon>
  );
}
