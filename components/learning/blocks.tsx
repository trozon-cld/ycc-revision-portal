import type { Block, CalloutBlock, PictureBlock } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import { InlineText } from "./inline-text";
import { BookPicture } from "./picture";

// Candidate-facing block renderers. Sizes are in em so the A−/A+ text size scales everything.
// Pictures and boxes never split across sheets; headings stay with what follows.

export function BlockList({ blocks, media }: { blocks: Block[]; media: ResolvedMedia }) {
  return (
    <>
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} media={media} />
      ))}
    </>
  );
}

function BlockView({ block, media }: { block: Block; media: ResolvedMedia }) {
  switch (block.type) {
    case "heading":
      return block.level === 1 ? (
        <h2 className="mb-[0.5em] mt-[0.9em] text-[1.45em] font-bold leading-tight text-primary [break-after:avoid] [break-inside:avoid] first:mt-0">
          <InlineText text={block.text} />
        </h2>
      ) : (
        <h3 className="mb-[0.4em] mt-[0.8em] text-[1.2em] font-bold leading-snug text-ink [break-after:avoid] [break-inside:avoid] first:mt-0">
          <InlineText text={block.text} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="mb-[0.8em] whitespace-pre-line [orphans:2] [widows:2]">
          <InlineText text={block.text} />
        </p>
      );
    case "list": {
      const Tag = block.style === "numbered" ? "ol" : "ul";
      return (
        <Tag
          className={`mb-[0.8em] space-y-[0.3em] pl-[1.4em] ${
            block.style === "numbered" ? "list-decimal" : "list-disc"
          } marker:text-primary`}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-[0.2em] [break-inside:avoid]">
              <InlineText text={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case "picture":
      return <PictureView block={block} media={media} />;
    case "callout":
      return <CalloutView block={block} />;
  }
}

function PictureView({ block, media }: { block: PictureBlock; media: ResolvedMedia }) {
  return <BookPicture picture={media[block.mediaId]} size={block.size} align={block.align} caption={block.caption} />;
}

const CALLOUT_STYLE = {
  "key-point": { label: "Key point", box: "border-primary bg-primary/[0.07]", title: "text-primary" },
  remember: { label: "Remember", box: "border-amber-600 bg-amber-50", title: "text-amber-900" },
} as const;

function CalloutView({ block }: { block: CalloutBlock }) {
  const style = CALLOUT_STYLE[block.tone];
  return (
    <aside
      aria-label={style.label}
      className={`mb-[0.9em] rounded-r-lg border-l-[0.3em] px-[0.9em] py-[0.7em] [break-inside:avoid] ${style.box}`}
    >
      <p className={`mb-[0.2em] text-[0.8em] font-bold uppercase tracking-wide ${style.title}`}>{style.label}</p>
      <p className="whitespace-pre-line">
        <InlineText text={block.text} />
      </p>
    </aside>
  );
}
