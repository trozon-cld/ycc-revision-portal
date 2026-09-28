import type { ReactNode } from "react";

// The usual padded column for candidate pages (the book reader uses the full width instead).
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-6 pb-10 sm:pt-8">{children}</div>;
}
