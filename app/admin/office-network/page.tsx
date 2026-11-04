import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guard";
import { isOfficeAddress, loadOfficeNetwork } from "@/lib/auth/office-network";
import { ipFromHeaders } from "@/lib/audit/log";
import { formatUkDate } from "@/lib/candidates/access";
import { pool } from "@/lib/db/pool";
import { countOf } from "@/lib/format";
import { OFFICE_ADDRESS_MAX_COUNT } from "@/lib/limits";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { PersonLabel } from "@/components/admin/person-label";
import { cardClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { AddAddressButton, OfficeAddressActions, OfficeSwitchButton } from "./office-network-controls";

export const metadata: Metadata = { title: "Office Network" };

const NOTE = "rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25";

// Superadmin only: where Admins may work from. Exemptions are set per Admin on the Admins page.
export default async function OfficeNetworkPage() {
  await requireRole(["superadmin"]);
  const [network, { rows: exempt }, requestHeaders] = await Promise.all([
    loadOfficeNetwork(),
    pool.query<{ id: string; email: string; full_name: string | null }>(
      `select id, email, full_name from users where role = 'admin' and office_exempt order by full_name nulls last, email`
    ),
    headers(),
  ]);
  const { isOn, addresses } = network;
  const ip = ipFromHeaders(requestHeaders);
  const onList = isOfficeAddress(ip, addresses.map((entry) => entry.address));
  const hasRoom = addresses.length < OFFICE_ADDRESS_MAX_COUNT;

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Office Network"
          description={`${isOn ? "On" : "Off"} · ${countOf(addresses.length, "address", "addresses")}`}
          actions={
            <>
              {hasRoom && <AddAddressButton />}
              {(isOn || addresses.length > 0) && <OfficeSwitchButton isOn={isOn} addressCount={addresses.length} exemptCount={exempt.length} />}
            </>
          }
        />
        <p className="mb-4 max-w-3xl text-sm text-slate-600">
          When the check is on, Admins can sign in and use admin pages only from the addresses below. Admins marked
          &ldquo;Any network&rdquo; on the Admins page can work from anywhere. You and candidates are never limited.
          {!hasRoom && ` You have reached the limit of ${OFFICE_ADDRESS_MAX_COUNT} addresses.`}
        </p>

        <dl className={`${cardClass} mb-4 divide-y divide-slate-200 text-sm`}>
          <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-4">
            <dt className="text-slate-600">Office network check</dt>
            <dd>
              <Badge tone={isOn ? "success" : "neutral"}>{isOn ? "On" : "Off"}</Badge>
            </dd>
          </div>
          <div className="grid gap-1 px-4 py-2.5 sm:grid-cols-[12rem_1fr] sm:items-center sm:gap-4">
            <dt className="text-slate-600">Your current address</dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-2 text-ink">
              {ip ? (
                <>
                  <span className="font-medium [overflow-wrap:anywhere]">{ip}</span>
                  <Badge tone={onList ? "success" : "neutral"}>{onList ? "On the list" : "Not on the list"}</Badge>
                  {!onList && hasRoom && <AddAddressButton suggested={ip} />}
                </>
              ) : (
                <span className="text-slate-600">Not known</span>
              )}
            </dd>
          </div>
        </dl>

        {isOn && ip && !onList && (
          <p role="status" className={`${NOTE} mb-4`}>
            Your current address isn&apos;t on the list. You can still work from here, but Admins using this network would
            be refused.
          </p>
        )}

        <Table columns={["Address", "Label", "Added", ""]} isEmpty={addresses.length === 0} emptyMessage="No addresses yet. Add the office's addresses before turning the check on.">
          {addresses.map((entry) => (
            <Row key={entry.id}>
              <Cell kind="primary">{entry.address}</Cell>
              <Cell label="Label">{entry.label}</Cell>
              <Cell label="Added" nowrap>
                {formatUkDate(entry.createdAt)}
              </Cell>
              <Cell kind="actions">
                <OfficeAddressActions id={entry.id} address={entry.address} label={entry.label} />
              </Cell>
            </Row>
          ))}
        </Table>
      </div>

      <section aria-labelledby="exempt-heading">
        <h2 id="exempt-heading" className="text-base font-semibold text-ink">
          Admins who can work from any network
        </h2>
        <p className="mt-0.5 mb-3 text-sm text-slate-600">
          Change this on the{" "}
          <Link href="/admin/admins" className="text-primary underline underline-offset-2">
            Admins page
          </Link>{" "}
          (row menu: Allow from any network).
        </p>
        {exempt.length === 0 ? (
          <p className={`${cardClass} px-4 py-3 text-sm text-slate-600`}>None. Every Admin is limited to the office network while the check is on.</p>
        ) : (
          <ul className={`${cardClass} divide-y divide-slate-200 text-sm`}>
            {exempt.map((admin) => (
              <li key={admin.id} className="px-4 py-2.5 font-medium text-ink">
                <PersonLabel name={admin.full_name} email={admin.email} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
