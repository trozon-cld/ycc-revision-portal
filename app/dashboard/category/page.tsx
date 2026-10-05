import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { PageBody } from "@/components/candidate/page-body";
import { loadSwitchableCategories } from "@/lib/candidates/categories";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { switchCategory } from "./actions";

const ERRORS: Record<string, string> = {
  choose: "Please choose a category.",
  unavailable: "That category isn’t available to you. Please choose one from the list.",
};

export default async function ChangeCategoryPage({ searchParams }: PageProps<"/dashboard/category">) {
  const session = await requireRole(["candidate"]);
  const categories = await loadSwitchableCategories(session.sub);
  if (categories.length === 0) redirect(SESSION_ENDED_LOGIN);

  const params = await searchParams;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const error = errorKey ? ERRORS[errorKey] : undefined;

  return (
    <PageBody>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-ink">Change category</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink">
          Your Handbook, Practice questions and Mock tests follow the category you choose. You can change it again at
          any time.
        </p>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-semibold text-red-800">
            {error}
          </p>
        )}

        <form action={switchCategory} className="mt-6">
          <fieldset>
            <legend className="mb-3 text-xl font-bold text-ink">Choose a category</legend>
            <div className="flex flex-col gap-3">
              {categories.map((category) => (
                <label
                  key={category.id}
                  className="flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-2 border-ink/20 bg-white px-5 py-3 hover:border-primary has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary"
                >
                  <input
                    type="radio"
                    name="categoryId"
                    value={category.id}
                    defaultChecked={category.isCurrent}
                    required
                    className="size-6 shrink-0 accent-primary focus-visible:outline-none"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">{category.name}</span>
                    {(category.isCurrent || category.isAssigned) && (
                      <span className="text-base text-ink/80">
                        {[category.isCurrent && "Studying now", category.isAssigned && "Your starting category"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className={PRIMARY_BUTTON}
            >
              Save category
            </button>
            <Link
              href="/dashboard"
              className={SECONDARY_BUTTON}
            >
              Back to home
            </Link>
          </div>
        </form>
      </div>
    </PageBody>
  );
}
