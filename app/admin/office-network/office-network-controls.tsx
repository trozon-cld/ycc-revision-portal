"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { ActionButton, PanelButton, RowActions } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { OFFICE_ADDRESS_MAX_LENGTH, OFFICE_LABEL_MAX_LENGTH } from "@/lib/limits";
import { addOfficeAddress, removeOfficeAddress, setOfficeNetworkOn } from "./actions";

export function OfficeSwitchButton({ isOn, addressCount, exemptCount }: { isOn: boolean; addressCount: number; exemptCount: number }) {
  const exempt = exemptCount === 0 ? "No Admins are" : exemptCount === 1 ? "1 Admin is" : `${exemptCount} Admins are`;
  return (
    <ActionButton
      variant={isOn ? "secondary" : "primary"}
      action={{
        label: isOn ? "Turn off" : "Turn on",
        title: isOn ? "Turn off the office network check?" : "Turn on the office network check?",
        variant: "confirm",
        render: (close) => (
          <ActionForm
            action={setOfficeNetworkOn}
            hidden={{ on: isOn ? "false" : "true" }}
            submitLabel={isOn ? "Turn off" : "Turn on"}
            pendingLabel={isOn ? "Turning off…" : "Turning on…"}
            successMessage={isOn ? "Office network check turned off." : "Office network check turned on."}
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              {isOn
                ? "Admins will be able to sign in and use admin pages from any network again."
                : `Admins will be able to sign in and use admin pages only from the ${addressCount === 1 ? "address" : `${addressCount} addresses`} listed. Admins signed in elsewhere are stopped at their next click. ${exempt} allowed to work from any network.`}
            </p>
          </ActionForm>
        ),
      }}
    />
  );
}

export function AddAddressButton({ suggested }: { suggested?: string }) {
  return (
    <PanelButton
      label={suggested ? "Add this address" : "Add address"}
      title="Add office address"
      variant={suggested ? "secondary" : "primary"}
      icon={!suggested}
    >
      {(close) => (
        <ActionForm action={addOfficeAddress} submitLabel="Add address" pendingLabel="Adding…" successMessage="Address added." onSuccess={close} onCancel={close}>
          <Field id="office-address" label="IP address or range" hint="For example 203.0.113.8, or a range such as 203.0.113.8/30. IPv6 works too.">
            <input
              id="office-address"
              name="address"
              type="text"
              required
              maxLength={OFFICE_ADDRESS_MAX_LENGTH}
              defaultValue={suggested}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
          <Field id="office-label" label="Label" hint="Where it is, so it's easy to recognise later. For example: Main office, line 2.">
            <input id="office-label" name="label" type="text" required maxLength={OFFICE_LABEL_MAX_LENGTH} autoComplete="off" className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function OfficeAddressActions({ id, address, label }: { id: string; address: string; label: string }) {
  return (
    <RowActions
      label={`Actions for ${address}`}
      actions={[
        {
          label: "Remove",
          danger: true,
          title: "Remove address?",
          variant: "confirm",
          render: (close) => (
            <ActionForm
              action={removeOfficeAddress}
              hidden={{ addressId: id }}
              submitLabel="Remove"
              pendingLabel="Removing…"
              variant="danger"
              successMessage="Address removed."
              onSuccess={close}
              onCancel={close}
            >
              <p className="text-sm">
                <strong className="font-medium [overflow-wrap:anywhere]">{address}</strong> ({label}) will be removed. Admins
                using it will be stopped at their next click while the check is on.
              </p>
            </ActionForm>
          ),
        },
      ]}
    />
  );
}
