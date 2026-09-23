import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { LogoutButton } from "@/components/logout-button";
import { SuperadminNav } from "@/components/superadmin-nav";
import { CreateCategoryForm } from "./create-category-form";
import { CategoryItem } from "./category-item";

interface CategoryRow {
  id: string;
  name: string;
  candidate_count: number;
}

export default async function CategoriesPage() {
  const session = await requireRole(["superadmin"]);

  const { rows: categories } = await pool.query<CategoryRow>(
    `select c.id, c.name, count(u.id)::int as candidate_count
     from categories c
     left join users u on u.category_id = c.id
     group by c.id, c.name
     order by c.name`
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base uppercase tracking-wide text-primary">
            Superadmin
          </p>
          <h1 className="text-2xl font-semibold text-ink">Categories</h1>
          <p className="mt-1 text-base text-ink/70">
            Signed in as {session.email}
          </p>
        </div>
        <LogoutButton />
      </div>

      <SuperadminNav current="/admin/categories" />

      <CreateCategoryForm />

      <div>
        <h2 className="text-lg font-medium text-ink">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"}
        </h2>
        <ul className="mt-3 divide-y divide-ink/15 rounded-lg border border-ink/15">
          {categories.map((category) => (
            <CategoryItem
              key={category.id}
              id={category.id}
              name={category.name}
              candidateCount={category.candidate_count}
            />
          ))}
          {categories.length === 0 && (
            <li className="p-4 text-base text-ink/70">No categories yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
