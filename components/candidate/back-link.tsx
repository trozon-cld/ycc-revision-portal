import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

// Above the title on ordinary candidate pages, whose own "Back to home" is at the bottom (focused modes have their bar).
export function BackLink({ href = "/dashboard", label = "Home", icon = "home" }: { href?: string; label?: string; icon?: IconName }) {
  return (
    <Link
      href={href}
      className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-base font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon name={icon} />
      {label}
    </Link>
  );
}
