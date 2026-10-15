"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEFAULT_TEXT_SIZE, type TextSize } from "@/lib/content/book";
import { NOTE_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { AccountLinks, HomeLogo } from "@/components/candidate/header";
import { Icon } from "@/components/icons";
import { logOut } from "@/components/logout-button";
import {
  BAR_BUTTON_DENSE,
  PANEL_LINK,
  ReaderLabelsContext,
  useReaderLabels,
  SettingsPanel,
  TextSizeStep,
  barButton,
} from "@/components/learning/reader-tools";

// The focused frame of Practice and the Mock test, like the Handbook reader: its own bar instead of the
// site header (on every screen), the page scrolling below it, and the Settings panel covering the page.

const WIDE_QUERY = "(min-width: 1024px)";

// Phones and tablets: the word sits under the icon; laptops: one slimmer bar with the word beside it.
const BAR_SIZE = "h-14 min-w-14 flex-col gap-0 px-2 text-sm leading-tight lg:h-12 lg:min-w-12 lg:flex-row lg:gap-2 lg:px-3 lg:text-base";
const ICON_ONLY = "h-14 min-w-14 px-2 lg:h-12 lg:min-w-12";

// Same shares of the screen height as a Handbook page (below the bar), so a question with answer
// pictures fits on a laptop screen without scrolling.
const PAGE_HEIGHT = "(100dvh - 4.5rem)";
const PICTURE_LIMITS = {
  "--book-picture-max": `max(120px, calc(${PAGE_HEIGHT} * 0.6))`,
  "--book-picture-share": `max(120px, calc(${PAGE_HEIGHT} * 0.6))`,
  "--book-option-picture-max": `max(140px, calc(${PAGE_HEIGHT} * 0.22))`,
} as CSSProperties;

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function FocusedShell({
  label,
  status,
  shortStatus,
  progress,
  textSize,
  onTextSizeChange,
  actions,
  timer,
  accountInSettings = false,
  leaveWarning,
  scrollRef,
  children,
}: {
  // The bar's name for screen readers, e.g. "Practice tools".
  label: string;
  // In the middle of the bar, e.g. "Question 3 of 20".
  status: string;
  // Phones held upright, where the bar is narrow, e.g. "3 of 20".
  shortStatus?: string;
  // A thin line along the bottom of the bar.
  progress?: { done: number; total: number };
  textSize?: TextSize;
  onTextSizeChange?: (size: TextSize) => void;
  // In Settings, e.g. End practice.
  actions?: ReactNode;
  // Mock test: the clock, in the bar from 840px wide (it needs the room) and in a strip under it below that.
  timer?: (place: "bar" | "strip") => ReactNode;
  // Help and Log out live in Settings on every screen (the Mock test keeps its bar for the clock).
  accountInSettings?: boolean;
  // Mock test: leaving (Home, Help, Log out) asks first, on the page, with this text.
  leaveWarning?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [showLabels, toggleLabels] = useReaderLabels();
  const [settings, setSettings] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const router = useRouter();
  const [leaving, setLeaving] = useState<{ href: string } | { logout: true } | null>(null);
  const stayButton = useRef<HTMLButtonElement>(null);

  // With a leave warning, a tap on a link or Log out inside the frame asks first.
  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!leaveWarning || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Element;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    const logout = target.closest("[data-logout]");
    if (link && (link.target === "_blank" || link.origin !== window.location.origin)) return;
    if (!link && !logout) return;
    event.preventDefault();
    event.stopPropagation();
    setSettings(false);
    setLeaving(link ? { href: link.pathname + link.search } : { logout: true });
  }

  function leave() {
    if (!leaving) return;
    if ("href" in leaving) router.push(leaving.href);
    else logOut().catch(() => setLeaving(null));
  }

  useEffect(() => {
    if (leaving) stayButton.current?.focus();
  }, [leaving]);

  // Closing Settings puts focus back on its button.
  useEffect(() => {
    if (wasOpen.current && !settings) settingsButton.current?.focus();
    wasOpen.current = settings;
  }, [settings]);


  const size = showLabels ? BAR_SIZE : ICON_ONLY;
  const word = (text: string) => <span className={showLabels ? undefined : "sr-only"}>{text}</span>;

  return (
    <ReaderLabelsContext.Provider value={showLabels}>
      <div data-focused-owns-header="" onClickCapture={onClickCapture} className="flex h-dvh min-h-0 flex-col">
        {/* Three columns with equal sides (never narrower than their buttons), so the status stays centred and clear. */}
        <div
          role="toolbar"
          aria-label={label}
          className="relative grid grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2 border-b border-line bg-card px-3 py-2 lg:px-6"
        >
          <div className="flex min-w-0 items-center">
            <div className="hidden shrink-0 lg:flex">
              <HomeLogo showName={false} />
            </div>
            <Link href="/dashboard" title={showLabels ? undefined : "Home"} className={`${barButton} ${size} lg:hidden`}>
              <Icon name="home" />
              {word("Home")}
            </Link>
          </div>
          <span className="min-w-0 truncate px-1 text-center text-base font-semibold text-ink">
            {shortStatus ? (
              <>
                <span className="phone-upright:hidden">{status}</span>
                <span aria-hidden="true" className="hidden phone-upright:inline">
                  {shortStatus}
                </span>
              </>
            ) : (
              status
            )}
          </span>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {timer && <div className="hidden shrink-0 min-[840px]:flex">{timer("bar")}</div>}
            {onTextSizeChange && textSize && (
              <div className="flex shrink-0 gap-2 phone-upright:hidden">
                <TextSizeStep step={-1} textSize={textSize} onChange={onTextSizeChange} className={`${barButton} ${ICON_ONLY} text-lg`} />
                <TextSizeStep step={1} textSize={textSize} onChange={onTextSizeChange} className={`${barButton} ${ICON_ONLY} text-lg`} />
              </div>
            )}
            <button
              ref={settingsButton}
              type="button"
              aria-pressed={settings}
              onClick={() => setSettings((open) => !open)}
              title={showLabels ? undefined : "Settings"}
              className={`${barButton} ${size}`}
            >
              <Icon name="settings" />
              {word("Settings")}
            </button>
            {!accountInSettings && (
              <div className="ml-2 hidden shrink-0 items-center gap-2 border-l border-line-soft pl-4 lg:flex">
                <AccountLinks buttonClass={`${barButton} ${BAR_BUTTON_DENSE}`} />
              </div>
            )}
          </div>
          {progress && progress.total > 0 && (
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-ink/10">
              <div className="hc-fill h-full bg-primary" style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }} />
            </div>
          )}
        </div>
        {timer && <div className="flex justify-center border-b border-line bg-card px-3 py-1.5 min-[840px]:hidden">{timer("strip")}</div>}
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="focused-scroll absolute inset-0 overflow-y-auto" style={PICTURE_LIMITS}>
            {children}
          </div>
          {settings && (
            <SettingsPanel
              textSize={textSize ?? DEFAULT_TEXT_SIZE}
              onTextSizeChange={onTextSizeChange}
              showLabels={showLabels}
              onToggleLabels={toggleLabels}
              actions={actions}
              links={
                wide && !accountInSettings ? undefined : (
                  <>
                    <Link href="/dashboard" className={PANEL_LINK}>
                      Back to home
                    </Link>
                    <AccountLinks buttonClass={PANEL_LINK} />
                  </>
                )
              }
              onClose={() => setSettings(false)}
            />
          )}
          {leaving && leaveWarning && (
            <div className="absolute inset-0 z-20 overflow-y-auto bg-card px-4 py-8">
              <div
                role="alertdialog"
                aria-labelledby="leave-heading"
                aria-describedby="leave-text"
                onKeyDown={(event) => event.key === "Escape" && setLeaving(null)}
                className={`mx-auto max-w-xl ${NOTE_BOX} p-5`}
              >
                <h2 id="leave-heading" className="text-xl font-bold text-ink">
                  Leave the test?
                </h2>
                <p id="leave-text" className="mt-2 text-lg leading-relaxed text-ink">
                  {leaveWarning}
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button ref={stayButton} type="button" onClick={() => setLeaving(null)} className={PRIMARY_BUTTON}>
                    Stay in the test
                  </button>
                  <button type="button" onClick={leave} className={SECONDARY_BUTTON}>
                    {"logout" in leaving ? "Leave and log out" : "Leave"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ReaderLabelsContext.Provider>
  );
}
