// What a form's server action returns: an error to show, or success. Each area names its own alias,
// so one can add fields later without changing the others.
export type FormState = { error?: string; success?: boolean };
