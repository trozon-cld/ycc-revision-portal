"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { NAME_MAX_LENGTH } from "@/lib/users/name";
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/users/credentials";
import { createCandidate } from "./actions";
import { AccessLengthField } from "./access-length-field";
import { TestTypeOptions, type TestTypeChoice } from "./test-type-options";

export function NewCandidateButton({
  testTypes,
  minDate,
  maxDate,
}: {
  testTypes: TestTypeChoice[];
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
          {testTypes.length === 0 && (
            <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong">
              No test types are available yet. A test type is needed before a candidate can be created.
            </p>
          )}
          <Field id="new-candidate-name" label="Name">
            <input id="new-candidate-name" name="name" type="text" required maxLength={NAME_MAX_LENGTH} autoComplete="off" className={inputClass} />
          </Field>
          <Field id="new-candidate-email" label="Email">
            <input id="new-candidate-email" name="email" type="email" maxLength={MAX_EMAIL_LENGTH} required autoComplete="off" className={inputClass} />
          </Field>
          <Field id="new-candidate-password" label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
            <input
              id="new-candidate-password"
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Field
            id="new-candidate-test-type"
            label="Test type"
            hint="The candidate starts here and can switch to others in the same test area."
          >
            <select id="new-candidate-test-type" name="testTypeId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Select a test type
              </option>
              <TestTypeOptions testTypes={testTypes} />
            </select>
          </Field>
          <AccessLengthField idPrefix="new-candidate" label="Access length" minDate={minDate} maxDate={maxDate} />
        </ActionForm>
      )}
    </PanelButton>
  );
}
