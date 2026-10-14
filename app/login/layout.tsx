import type { Metadata } from "next";

// The login page itself runs in the browser, so its title is set here.
export const metadata: Metadata = { title: "Log in" };

export default function LoginLayout({ children }: LayoutProps<"/login">) {
  return children;
}
