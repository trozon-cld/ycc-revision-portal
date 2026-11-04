import Image from "next/image";
import { LOGO } from "@/lib/brand";

// The YCC logo above the card on pages outside the portal's top bar (login, access ended, office network only).
export function PageLogo() {
  return <Image src={LOGO.src} width={LOGO.width} height={LOGO.height} alt="YCC" unoptimized loading="eager" className="mb-6 h-11 w-auto max-w-[220px] object-contain" />;
}
