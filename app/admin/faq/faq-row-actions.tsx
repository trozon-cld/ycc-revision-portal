"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { inputClass, textareaClass } from "@/components/admin/styles";
import { SUPPORT_FIELDS, type FaqItem, type SupportContact } from "@/lib/faq/types";
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
  SUPPORT_EMAIL_MAX_LENGTH,
  SUPPORT_HOURS_MAX_LENGTH,
  SUPPORT_NOTE_MAX_LENGTH,
  SUPPORT_PHONE_MAX_LENGTH,
} from "@/lib/limits";
import { createFaq, deleteFaq, moveFaq, saveSupportContact, setFaqShown, updateFaq } from "./actions";

function FaqFields({ id, item }: { id: string; item?: FaqItem }) {
  return (
    <>
      <Field id={`${id}-question`} label="Question">
        <input id={`${id}-question`} name="question" type="text" required maxLength={FAQ_QUESTION_MAX_LENGTH} defaultValue={item?.question} className={inputClass} />
      </Field>
      <Field id={`${id}-answer`} label="Answer" hint="Plain text. Leave an empty line between paragraphs.">
        <textarea id={`${id}-answer`} name="answer" required rows={10} maxLength={FAQ_ANSWER_MAX_LENGTH} defaultValue={item?.answer} className={textareaClass} />
      </Field>
    </>
  );
}

export function NewFaqButton() {
  return (
    <PanelButton label="Add question" title="Add question">
      {(close) => (
        <ActionForm action={createFaq} submitLabel="Add question" pendingLabel="Adding…" successMessage="Question added. It's hidden until you show it." onSuccess={close} onCancel={close}>
          <FaqFields id="new-faq" />
          <p className="text-sm text-slate-600">It&apos;s added at the end and hidden from candidates until you show it.</p>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function FaqRowActions({ item, isFirst, isLast }: { item: FaqItem; isFirst: boolean; isLast: boolean }) {
  const hidden = { faqId: item.id };
  const shown = item.status === "published";
  const actions: RowAction[] = [
    {
      label: "Edit",
      title: "Edit question",
      render: (close) => (
        <ActionForm action={updateFaq} hidden={hidden} submitLabel="Save changes" successMessage="Question saved." onSuccess={close} onCancel={close}>
          <FaqFields id={`edit-faq-${item.id}`} item={item} />
        </ActionForm>
      ),
    },
  ];
  if (!isFirst) actions.push({ label: "Move up", run: () => moveFaq(item.id, "up"), successMessage: "Question moved up." });
  if (!isLast) actions.push({ label: "Move down", run: () => moveFaq(item.id, "down"), successMessage: "Question moved down." });
  actions.push(
    shown
      ? { label: "Hide from candidates", run: () => setFaqShown(item.id, false), successMessage: "Question hidden." }
      : { label: "Show to candidates", run: () => setFaqShown(item.id, true), successMessage: "Question shown to candidates." }
  );
  actions.push({
    label: "Delete",
    danger: true,
    title: "Delete question?",
    variant: "confirm",
    render: (close) => (
      <ActionForm action={deleteFaq} hidden={hidden} submitLabel="Delete" pendingLabel="Deleting…" variant="danger" successMessage="Question deleted." onSuccess={close} onCancel={close}>
        <p className="text-sm">
          <strong className="font-medium">{item.question}</strong> will be removed. This can&apos;t be undone.
        </p>
      </ActionForm>
    ),
  });
  return <RowActions label={`Actions for question ${item.question}`} actions={actions} />;
}

const CONTACT_LIMITS: Record<keyof SupportContact, number> = {
  email: SUPPORT_EMAIL_MAX_LENGTH,
  phone: SUPPORT_PHONE_MAX_LENGTH,
  hours: SUPPORT_HOURS_MAX_LENGTH,
  note: SUPPORT_NOTE_MAX_LENGTH,
};
const CONTACT_HINTS: Partial<Record<keyof SupportContact, string>> = {
  hours: "For example: Monday to Friday, 9am to 5pm.",
  note: "Anything else candidates should know, such as how quickly you reply.",
};

export function SupportContactButton({ contact }: { contact: SupportContact }) {
  return (
    <PanelButton label="Edit contact details" title="Support contact details" variant="secondary" icon={false}>
      {(close) => (
        <ActionForm action={saveSupportContact} submitLabel="Save details" successMessage="Contact details saved." onSuccess={close} onCancel={close}>
          <p className="text-sm text-slate-600">All optional. Candidates see only the details filled in.</p>
          {SUPPORT_FIELDS.map((field) => {
            const id = `support-${field.key}`;
            return (
              <Field key={field.key} id={id} label={field.label} hint={CONTACT_HINTS[field.key]}>
                {field.key === "note" ? (
                  <textarea id={id} name={field.key} rows={4} maxLength={CONTACT_LIMITS[field.key]} defaultValue={contact[field.key] ?? ""} className={textareaClass} />
                ) : (
                  <input
                    id={id}
                    name={field.key}
                    type={field.key === "email" ? "email" : field.key === "phone" ? "tel" : "text"}
                    maxLength={CONTACT_LIMITS[field.key]}
                    defaultValue={contact[field.key] ?? ""}
                    className={inputClass}
                  />
                )}
              </Field>
            );
          })}
        </ActionForm>
      )}
    </PanelButton>
  );
}
