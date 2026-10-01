"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { TEXT_SIZES, type TextSize } from "@/lib/content/book";
import { AccountLinks, HomeLogo } from "@/components/candidate/header";
import {
  BAR_BUTTON_DENSE,
  HOME_ICON,
  Icon,
  PANEL_LINK,
  ReaderLabelsContext,
  SETTINGS_ICON,
  SettingsPanel,
  barButton,
} from "@/components/learning/reader-tools";

// Practice's focused frame, like the Handbook reader: its own bar instead of the site header (on every
// screen), the page scrolling below it, and the Settings panel covering the page.

// Shared with the Handbook, so one choice applies to both (remembered on this device).
const LABELS_KEY = "ycc-reader-labels";
const WIDE_QUERY = "(min-width: 1024px)";

// Phones and tablets: the word sits under the icon; laptops: one slimmer bar with the word beside it.
const BAR_SIZE = "h-14 min-w-14 flex-col gap-0 px-2 text-sm leading-tight lg:h-12 lg:min-w-12 lg:flex-row lg:gap-2 lg:px-3 lg:text-base";
const ICON_ONLY = "h-14 min-w-14 px-2 lg:h-12 lg:min-w-12";

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function PracticeShell({
  status,
  shortStatus,
  progress,
  textSize,
  onTextSizeChange,
  actions,
  scrollRef,
  children,
}: {
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
  scrollRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [showLabels, setShowLabels] = useState(true);
  const [settings, setSettings] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LABELS_KEY) === "off") setShowLabels(false);
    } catch {
      // Storage can be blocked (private windows); labels simply stay on.
    }
  }, []);
  // Closing Settings puts focus back on its button.
  useEffect(() => {
    if (wasOpen.current && !settings) settingsButton.current?.focus();
    wasOpen.current = settings;
  }, [settings]);

  const toggleLabels = useCallback(() => {
    setShowLabels((current) => {
      try {
        window.localStorage.setItem(LABELS_KEY, current ? "off" : "on");
      } catch {
        // Not remembered, but still switched for this visit.
      }
      return !current;
    });
  }, []);

  const size = showLabels ? BAR_SIZE : ICON_ONLY;
  const word = (text: string) => <span className={showLabels ? undefined : "sr-only"}>{text}</span>;
  const index = textSize ? TEXT_SIZES.indexOf(textSize) : -1;

  return (
    <ReaderLabelsContext.Provider value={showLabels}>
      <div data-practice-owns-header="" className="flex h-dvh min-h-0 flex-col">
        <div role="toolbar" aria-label="Practice tools" className="relative flex items-center gap-2 border-b border-slate-300 bg-white px-3 py-2 lg:px-6">
          <div className="hidden shrink-0 lg:flex">
            <HomeLogo showName={false} />
          </div>
          <Link href="/dashboard" title={showLabels ? undefined : "Home"} className={`${barButton} ${size} lg:hidden`}>
            <Icon path={HOME_ICON} />
            {word("Home")}
          </Link>
          <span className="min-w-0 flex-1 truncate px-1 text-center text-base font-semibold text-ink lg:text-lg">
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
          {onTextSizeChange && textSize && (
            <div className="flex shrink-0 gap-2 phone-upright:hidden">
              <button
                type="button"
                aria-label="Smaller text"
                disabled={index <= 0}
                onClick={() => onTextSizeChange(TEXT_SIZES[Math.max(0, index - 1)])}
                className={`${barButton} ${ICON_ONLY} text-lg`}
              >
                <span aria-hidden="true">A−</span>
              </button>
              <button
                type="button"
                aria-label="Larger text"
                disabled={index >= TEXT_SIZES.length - 1}
                onClick={() => onTextSizeChange(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, index + 1)])}
                className={`${barButton} ${ICON_ONLY} text-lg`}
              >
                <span aria-hidden="true" className="text-[1.15em]">
                  A+
                </span>
              </button>
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
            <Icon path={SETTINGS_ICON} />
            {word("Settings")}
          </button>
          <div className="ml-2 hidden shrink-0 items-center gap-2 border-l border-slate-200 pl-4 lg:flex">
            <AccountLinks buttonClass={`${barButton} ${BAR_BUTTON_DENSE}`} />
          </div>
          {progress && progress.total > 0 && (
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-ink/10">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
            {children}
          </div>
          {settings && (
            <SettingsPanel
              textSize={textSize ?? 16}
              onTextSizeChange={onTextSizeChange}
              showLabels={showLabels}
              onToggleLabels={toggleLabels}
              actions={actions}
              links={
                wide ? undefined : (
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
        </div>
      </div>
    </ReaderLabelsContext.Provider>
  );
}
