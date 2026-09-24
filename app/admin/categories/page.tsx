import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import { CategoryRowActions, NewCategoryButton } from "./category-row-actions";

interface CategoryRow {
  id: string;
  name: string;
  candidate_count: number;
}

export default async function CategoriesPage() {
  await requireRole(["superadmin"]);

  const { rows: categories } = await pool.query<CategoryRow>(
    `select c.id, c.name, count(u.id)::int as candidate_count
     from categories c
     left join users u on u.category_id = c.id
     group by c.id, c.name
     order by c.name`
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description={`${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
        actions={<NewCategoryButton />}
      />

      <Table
        columns={["Name", "Candidates", ""]}
        isEmpty={categories.length === 0}
        emptyMessage="No categories yet."
      >
        {categories.map((category) => (
          <Row key={category.id}>
            <Cell kind="primary">{category.name}</Cell>
            <Cell label="Candidates">{category.candidate_count}</Cell>
            <Cell kind="actions">
              <CategoryRowActions id={category.id} name={category.name} candidateCount={category.candidate_count} />
            </Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
