import type { ReactNode } from "react";

// The usual padded column on the page tint for candidate pages (the book reader uses the full width instead).
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-page">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-6 pb-10 sm:pt-8">{children}</div>
    </div>
  );
}
