import type { ComponentType } from "react";
import type { ResolvedMedia } from "@/lib/content/book";
import { cleanLine } from "@/lib/questions/text";
import type { HotspotContent, HotspotDraftAnswer } from "@/lib/questions/types/hotspot";
import type { MultiPickContent } from "@/lib/questions/types/multi-pick";
import type { PictureOptionDraft, SinglePictureContent } from "@/lib/questions/types/single-picture";
import type { SingleTextContent } from "@/lib/questions/types/single-text";
import type { QuestionType } from "@/lib/questions/types";
import { HotspotFields } from "./hotspot-fields";
import { MultiPickFields } from "./multi-pick-fields";
import { SinglePictureFields } from "./single-picture-fields";
import { SingleTextFields } from "./single-text-fields";

export type TypeFieldsProps = {
  content: unknown;
  answer: unknown;
  onChange: (content: unknown, answer: unknown) => void;
  newId: () => string;
  // Pictures chosen so far (full size) and picker thumbnails, keyed by media id.
  media: ResolvedMedia;
  thumbs: Record<string, string>;
  // Opens the Media picker; `onPicked` receives the chosen picture's id.
  choosePicture: (onPicked: (mediaId: string) => void) => void;
};

type TypeEditor = {
  Fields: ComponentType<TypeFieldsProps>;
  // What the live preview can show of a half-written question (e.g. empty options left out).
  previewable: (content: unknown, answer: unknown) => { content: unknown; answer: unknown };
  // True when Practice and Mock show this question's options in a shuffled order.
  shuffles: (content: unknown) => boolean;
  // True when the type's own picture is the question picture, so the separate one is hidden.
  ownsPicture?: boolean;
};

// Each type step (C1–C4) adds its editor fields here.
export const TYPE_EDITORS: Partial<Record<QuestionType, TypeEditor>> = {
  single_text: {
    Fields: SingleTextFields,
    previewable: (content, answer) => {
      const data = content as SingleTextContent;
      return { content: { ...data, options: data.options.filter((option) => cleanLine(option.text)) }, answer };
    },
    shuffles: (content) => !(content as SingleTextContent).keepOrder,
  },
  single_picture: {
    Fields: SinglePictureFields,
    previewable: (content, answer) => {
      const data = content as SinglePictureContent & { options: PictureOptionDraft[] };
      return { content: { ...data, options: data.options.filter((option) => option.mediaId) }, answer };
    },
    shuffles: (content) => !(content as SinglePictureContent).keepOrder,
  },
  multi_pick: {
    Fields: MultiPickFields,
    previewable: (content, answer) => {
      const data = content as MultiPickContent;
      return { content: { ...data, options: data.options.filter((option) => cleanLine(option.text)) }, answer };
    },
    shuffles: (content) => !(content as MultiPickContent).keepOrder,
  },
  hotspot: {
    Fields: HotspotFields,
    previewable: (content, answer) => {
      const data = answer as HotspotDraftAnswer;
      return { content: content as HotspotContent, answer: { areas: data.areas, label: data.label.trim() || undefined } };
    },
    shuffles: () => false,
    ownsPicture: true,
  },
};
