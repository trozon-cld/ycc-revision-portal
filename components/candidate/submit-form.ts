"use client";

import { startTransition, type FormEvent } from "react";

// Sends a form to its action without React's automatic reset, so the candidate's choices stay ticked if it
// doesn't go through (as the staff ActionForm does).
export function submitKeepingChoices(dispatch: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  };
}
