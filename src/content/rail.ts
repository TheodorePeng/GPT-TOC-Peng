import type { AnswerOutline } from "../shared/headings";
import type { HeadingDepth } from "../shared/settings";

export type RailMarker = {
  id: string;
  answerId: string;
  relativeDepth: HeadingDepth;
  width: number;
  isActive: boolean;
};

type RailMarkerInput = {
  outlines: AnswerOutline[];
  currentAnswerId: string | null;
  currentHeadingId: string | null;
  maxDepth: HeadingDepth;
};

const markerWidths: Record<HeadingDepth, number> = {
  1: 26,
  2: 22,
  3: 18,
  4: 15,
  5: 12,
  6: 9
};

export const getRailMarkers = ({
  outlines,
  currentAnswerId,
  currentHeadingId,
  maxDepth
}: RailMarkerInput): RailMarker[] => {
  const outline =
    outlines.find((item) => item.id === currentAnswerId) ?? outlines.at(-1);

  if (!outline) {
    return [];
  }

  return outline.headings
    .filter((heading) => heading.relativeDepth <= maxDepth)
    .map((heading) => ({
      id: heading.id,
      answerId: heading.answerId,
      relativeDepth: heading.relativeDepth,
      width: markerWidths[heading.relativeDepth],
      isActive: heading.id === currentHeadingId
    }));
};
