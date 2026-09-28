import { CandidateHeader } from "@/components/candidate/header";

// Every page below calls requireRole itself; a layout doesn't re-run on every navigation.
// Pages add their own padding (PageBody), so the book reader can use the whole width.
export default function CandidateLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <>
      <CandidateHeader />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
