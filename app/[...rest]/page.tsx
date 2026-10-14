import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Page not found" };

// Any address outside the candidate and staff areas shows the site's "not found" page.
export default function UnknownPage() {
  notFound();
}
