"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { createCandidate } from "./actions";
import { AccessLengthField } from "./access-length-field";
import { CategoryOptions, type CategoryChoice } from "./category-options";

export function NewCandidateButton({
  categories,
  minDate,
  maxDate,
}: {
  categories: CategoryChoice[];
  minDate: string;
  maxDate: string;
}) {
  return (
    <PanelButton label="New candidate" title="New candidate">
      {(close) => (
        <ActionForm
          action={createCandidate}
          submitLabel="Create candidate"
          pendingLabel="Creating…"
          successMessage="Candidate created."
          onSuccess={close}
          onCancel={close}
        >
          {categories.length === 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No categories are available yet. A category is needed before a candidate can be created.
            </p>
          )}
          <Field id="new-candidate-email" label="Email">
            <input id="new-candidate-email" name="email" type="email" required autoComplete="off" className={inputClass} />
          </Field>
          <Field id="new-candidate-password" label="Password" hint="At least 8 characters.">
            <input
              id="new-candidate-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Field
            id="new-candidate-category"
            label="Category"
            hint="The candidate starts here and can switch to others in the same group."
          >
            <select id="new-candidate-category" name="categoryId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a category
              </option>
              <CategoryOptions categories={categories} />
            </select>
          </Field>
          <AccessLengthField idPrefix="new-candidate" label="Access length" minDate={minDate} maxDate={maxDate} />
        </ActionForm>
      )}
    </PanelButton>
  );
}
