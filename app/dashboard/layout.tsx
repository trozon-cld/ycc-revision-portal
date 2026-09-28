import { CandidateHeader } from "@/components/candidate/header";

// Every page below calls requireRole itself; a layout doesn't re-run on every navigation.
export default function CandidateLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <>
      <CandidateHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-6 pb-10 sm:pt-8">{children}</main>
    </>
  );
}
