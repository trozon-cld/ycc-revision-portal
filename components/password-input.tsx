"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Icon } from "@/components/icons";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string; look: "candidate" | "staff" };

// Space kept at the field's end for the button, and the button's own look, per side of the portal.
const LOOKS = {
  candidate: { input: "pr-[6.5rem]", button: "rounded-r-xl px-3 text-base", icon: 20, weight: "bold" },
  staff: { input: "pr-[5.25rem]", button: "rounded-r-md px-2.5 text-sm", icon: 18, weight: "regular" },
} as const;

// A password field with its own Show/Hide button, the same in every browser (Edge's built-in eye is turned off).
// The password is hidden again whenever its form is sent, so password managers still see a password field.
export function PasswordInput({ id, look, className, disabled, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  const [said, setSaid] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const style = LOOKS[look];

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => {
      setShown(false);
      setSaid("");
    };
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <div className="relative">
      <input
        {...rest}
        ref={inputRef}
        id={id}
        type={shown ? "text" : "password"}
        disabled={disabled}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${className ?? ""} ${style.input} [&::-ms-reveal]:hidden`}
      />
      <button
        type="button"
        aria-controls={id}
        disabled={disabled}
        onClick={() => {
          setShown(!shown);
          setSaid(shown ? "Your password is hidden." : "Your password is shown.");
        }}
        className={`absolute inset-y-0 right-0 inline-flex min-w-11 items-center justify-center gap-1.5 font-semibold text-primary hover:bg-primary/10 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60 ${style.button}`}
      >
        <Icon name={shown ? "hide" : "show"} size={style.icon} weight={style.weight} />
        {shown ? "Hide" : "Show"}
        <span className="sr-only"> password</span>
      </button>
      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
