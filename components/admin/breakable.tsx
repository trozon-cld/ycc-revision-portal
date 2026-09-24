import { Fragment } from "react";

// Adds line-break opportunities after "@" and before "." so long emails wrap at
// natural points in narrow table columns instead of mid-word.
export function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=@)|(?=\.)/);
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </>
  );
}
