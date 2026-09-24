import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import { ChapterRowActions, NewChapterButton } from "./chapter-row-actions";

interface ChapterRow {
  id: string;
  position: number;
  title: string;
  status: "draft" | "published";
}

export default async function HandbookPage() {
  await requireRole(["superadmin"]);

  const { rows: chapters } = await pool.query<ChapterRow>(
    `select id, position, title, status from chapters order by position`
  );

  return (
    <>
      <PageHeader
        title="Handbook"
        description={`${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`}
        actions={<NewChapterButton />}
      />

      <Table columns={["Chapter", "Status", ""]} isEmpty={chapters.length === 0} emptyMessage="No chapters yet.">
        {chapters.map((chapter, index) => (
          <Row key={chapter.id}>
            <Cell kind="primary">
              <span className="mr-1 font-mono text-slate-600 tabular-nums">{formatNumber(chapter.position)}</span>{" "}
              {chapter.title}
            </Cell>
            <Cell label="Status" nowrap>
              <Badge tone={chapter.status === "published" ? "success" : "neutral"}>
                {chapter.status === "published" ? "Published" : "Draft"}
              </Badge>
            </Cell>
            <Cell kind="actions">
              <ChapterRowActions
                id={chapter.id}
                title={chapter.title}
                number={formatNumber(chapter.position)}
                isFirst={index === 0}
                isLast={index === chapters.length - 1}
              />
            </Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}

function formatNumber(position: number) {
  return String(position).padStart(2, "0");
}
