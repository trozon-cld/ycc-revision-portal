// Every icon in the app comes from here: Phosphor Icons (MIT licence, phosphoricons.com), server-safe build.
// Line icons normally ("bold" on candidate pages, "regular" in the staff console); "fill" for selected or on.
import type { IconWeight } from "@phosphor-icons/react/dist/lib/types";
import { ArchiveIcon } from "@phosphor-icons/react/dist/ssr/Archive";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowCounterClockwise";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/ssr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowUp";
import { BookOpenIcon } from "@phosphor-icons/react/dist/ssr/BookOpen";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { CheckIcon } from "@phosphor-icons/react/dist/ssr/Check";
import { CheckSquareIcon } from "@phosphor-icons/react/dist/ssr/CheckSquare";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { CopyIcon } from "@phosphor-icons/react/dist/ssr/Copy";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/ssr/DotsSixVertical";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/ssr/DotsThree";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { FlagIcon } from "@phosphor-icons/react/dist/ssr/Flag";
import { GearSixIcon } from "@phosphor-icons/react/dist/ssr/GearSix";
import { HouseIcon } from "@phosphor-icons/react/dist/ssr/House";
import { ImageIcon } from "@phosphor-icons/react/dist/ssr/Image";
import { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
import { LockIcon } from "@phosphor-icons/react/dist/ssr/Lock";
import { LockOpenIcon } from "@phosphor-icons/react/dist/ssr/LockOpen";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/ssr/ListBullets";
import { ListChecksIcon } from "@phosphor-icons/react/dist/ssr/ListChecks";
import { PauseIcon } from "@phosphor-icons/react/dist/ssr/Pause";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr/Plus";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr/Question";
import { SlidersHorizontalIcon } from "@phosphor-icons/react/dist/ssr/SlidersHorizontal";
import { SpeakerHighIcon } from "@phosphor-icons/react/dist/ssr/SpeakerHigh";
import { TagIcon } from "@phosphor-icons/react/dist/ssr/Tag";
import { TimerIcon } from "@phosphor-icons/react/dist/ssr/Timer";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { UserCircleIcon } from "@phosphor-icons/react/dist/ssr/UserCircle";
import { UserGearIcon } from "@phosphor-icons/react/dist/ssr/UserGear";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";

const ICONS = {
  // Candidate sections and tools
  home: HouseIcon,
  book: BookOpenIcon,
  practice: CheckSquareIcon,
  timer: TimerIcon,
  progress: ChartBarIcon,
  help: QuestionIcon,
  person: UserCircleIcon,
  settings: SlidersHorizontalIcon,
  contents: ListBulletsIcon,
  page: FileTextIcon,
  results: ListChecksIcon,
  listen: SpeakerHighIcon,
  pause: PauseIcon,
  "listen-back": ArrowCounterClockwiseIcon,
  flag: FlagIcon,
  // Marks and movement
  tick: CheckIcon,
  cross: XIcon,
  close: XIcon,
  previous: CaretLeftIcon,
  next: CaretRightIcon,
  expand: CaretDownIcon,
  "more-below": ArrowDownIcon,
  "move-up": ArrowUpIcon,
  "move-down": ArrowDownIcon,
  // Staff console
  menu: ListIcon,
  more: DotsThreeIcon,
  drag: DotsSixVerticalIcon,
  add: PlusIcon,
  duplicate: CopyIcon,
  delete: TrashIcon,
  picture: ImageIcon,
  admins: UserGearIcon,
  candidates: UsersIcon,
  testTypes: TagIcon,
  faq: ChatCircleTextIcon,
  archive: ArchiveIcon,
  activity: ClockCounterClockwiseIcon,
  account: GearSixIcon,
  locked: LockIcon,
  unlocked: LockOpenIcon,
} as const;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  // Pixel size, or "1em" to follow the text size (the Handbook's A−/A+).
  size?: number | string;
  weight?: Exclude<IconWeight, "duotone">;
  className?: string;
};

// Decorative: always hidden from screen readers, so the control's own text names it.
export function Icon({ name, size = 24, weight = "bold", className }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph aria-hidden="true" focusable="false" size={size} weight={weight} className={`shrink-0${className ? ` ${className}` : ""}`} />;
}
