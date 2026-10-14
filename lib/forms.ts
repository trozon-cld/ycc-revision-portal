import { unstable_rethrow } from "next/navigation";

// What a form's server action returns: an error to show, or success. Each area names its own alias,
// so one can add fields later without changing the others.
export type FormState = { error?: string; success?: boolean };

// Shown when an action got no answer: the connection dropped or the server failed.
export const NOT_THROUGH_MESSAGE = "That didn’t go through. Check your connection and try again.";

// Runs a server action from the browser; null when it didn't go through, instead of blanking the page.
// Next's own redirects (e.g. to the login page) still happen.
export async function reachServer<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return null;
  }
}
