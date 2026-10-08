import { requireRole } from "@/lib/auth/guard";
import { countOf } from "@/lib/format";
import { loadFaqItems, loadSupportContact } from "@/lib/faq/load";
import { SUPPORT_FIELDS } from "@/lib/faq/types";
import { FAQ_MAX_ITEMS } from "@/lib/limits";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { cardClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { FaqRowActions, NewFaqButton, SupportContactButton } from "./faq-row-actions";

// General queries: the questions candidates see, and the support contact details. Superadmin only.
export default async function FaqAdminPage() {
  await requireRole(["superadmin"]);
  const [items, contact] = await Promise.all([loadFaqItems(false), loadSupportContact()]);
  const shown = items.filter((item) => item.status === "published").length;

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="General queries"
          description={`${countOf(items.length, "question", "questions")} · ${shown} shown to candidates`}
          actions={items.length < FAQ_MAX_ITEMS ? <NewFaqButton /> : undefined}
        />
        <p className="mb-4 text-sm text-slate-600">
          Candidates see the shown questions in this order. Hidden questions are kept here until you show them.
          {items.length >= FAQ_MAX_ITEMS && ` You have reached the limit of ${FAQ_MAX_ITEMS} questions.`}
        </p>
        <Table columns={["Question", "Status", ""]} isEmpty={items.length === 0} emptyMessage="No questions yet.">
          {items.map((item, index) => (
            <Row key={item.id}>
              <Cell kind="primary">
                <span className="block">
                  <span className="tabular-nums text-slate-600">{item.position}.</span> {item.question}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-sm font-normal text-slate-600">{item.answer}</span>
              </Cell>
              <Cell label="Status" nowrap>
                {item.status === "published" ? <Badge tone="success">Shown</Badge> : <Badge>Hidden</Badge>}
              </Cell>
              <Cell kind="actions">
                <FaqRowActions item={item} isFirst={index === 0} isLast={index === items.length - 1} />
              </Cell>
            </Row>
          ))}
        </Table>
      </div>

      <section aria-labelledby="support-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="support-heading" className="text-base font-semibold text-ink">
              Support contact details
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              Shown to candidates under the questions, with the name of their own Admin. Only filled-in details are shown.
            </p>
          </div>
          <SupportContactButton contact={contact} />
        </div>
        <dl className={`${cardClass} divide-y divide-slate-200 text-sm`}>
          {SUPPORT_FIELDS.map((field) => (
            <div key={field.key} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-slate-600">{field.label}</dt>
              <dd className="whitespace-pre-line text-ink [overflow-wrap:anywhere]">{contact[field.key] ?? <span className="text-slate-600">Not set</span>}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
