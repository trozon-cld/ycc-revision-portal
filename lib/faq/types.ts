// General queries shapes shared by the server and the browser (no imports: safe in forms).

export type FaqStatus = "draft" | "published";
export type FaqItem = { id: string; position: number; question: string; answer: string; status: FaqStatus };
export type SupportContact = { email: string | null; phone: string | null; hours: string | null; note: string | null };

// The contact fields with their labels, in the order forms and pages show them.
export const SUPPORT_FIELDS = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "hours", label: "Opening hours" },
  { key: "note", label: "Note" },
] as const satisfies readonly { key: keyof SupportContact; label: string }[];
