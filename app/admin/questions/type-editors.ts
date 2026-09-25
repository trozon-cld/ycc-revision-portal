import type { ComponentType } from "react";
import { cleanLine } from "@/lib/questions/text";
import type { SingleTextContent } from "@/lib/questions/types/single-text";
import type { QuestionType } from "@/lib/questions/types";
import { SingleTextFields } from "./single-text-fields";

export type TypeFieldsProps = {
  content: unknown;
  answer: unknown;
  onChange: (content: unknown, answer: unknown) => void;
  newId: () => string;
};

type TypeEditor = {
  Fields: ComponentType<TypeFieldsProps>;
  // What the live preview can show of a half-written question (e.g. empty options left out).
  previewable: (content: unknown, answer: unknown) => { content: unknown; answer: unknown };
  // True when Practice and Mock show this question's options in a shuffled order.
  shuffles: (content: unknown) => boolean;
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
};
