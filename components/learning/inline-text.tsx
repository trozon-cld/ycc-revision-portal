import { Fragment } from "react";
import { parseInline } from "@/lib/content/inline";

export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, index) =>
        segment.bold ? (
          <strong key={index} className="font-bold">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        )
      )}
    </>
  );
}
