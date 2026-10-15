import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { PageBody } from "@/components/candidate/page-body";
import { loadSwitchableCategories } from "@/lib/candidates/categories";
import { loadMockInProgress } from "@/lib/mock/attempts";
import { loadPracticeInProgress } from "@/lib/practice/sessions";
import { ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON, WARN_BOX } from "@/components/candidate/buttons";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = { title: "Change category" };

const ERRORS: Record<string, string> = {
  choose: "Please choose a category.",
  unavailable: "That category isn’t available to you. Please choose one from the list.",
  mock: "Please finish your mock test before changing category.",
};

export default async function ChangeCategoryPage({ searchParams }: PageProps<"/dashboard/category">) {
  const session = await requireRole(["candidate"]);
  const [categories, mock, practice] = await Promise.all([
    loadSwitchableCategories(session.sub),
    loadMockInProgress(session.sub),
    loadPracticeInProgress(session.sub),
  ]);
  if (categories.length === 0) redirect(SESSION_ENDED_LOGIN);

  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <PageBody>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-ink">Change category</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink">
          Your Handbook, Practice questions and mock tests follow the category you choose. You can change it again at
          any time.
        </p>

        {mock ? (
          <div className="mt-6">
            <p role="status" className={`${WARN_BOX} p-4 text-lg leading-relaxed`}>
              <span className="font-bold">You have a mock test in progress.</span> Please finish it before changing category.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href={`/dashboard/mock/${mock.id}`} className={PRIMARY_BUTTON}>
                Continue mock test
              </Link>
              <Link href="/dashboard" className={SECONDARY_BUTTON}>
                Back to home
              </Link>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <p role="alert" className={`mt-6 ${ERROR_BOX}`}>
                {error}
              </p>
            )}
            {practice && (
              <p className={`mt-6 ${WARN_BOX} p-4 text-lg leading-relaxed`}>
                <span className="font-bold">
                  You have a practice in progress (question {Math.min(practice.position + 1, practice.total)} of {practice.total}).
                </span>{" "}
                Changing category ends it. Your answers so far are kept.
              </p>
            )}

            <CategoryForm categories={categories} />
          </>
        )}
      </div>
    </PageBody>
  );
}
