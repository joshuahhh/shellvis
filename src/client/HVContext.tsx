import { UpdateProxy } from "@engraft/update-proxy-react";
import { createContext } from "react";

type HVContext1 = {
  detailsMode: "grid" | "in-place"; // todo:  | 'one-by-one' | 'none'
  showTimeSlider: boolean;
  showMessages: boolean;
  showTrace: boolean;
  showAST: boolean;
  abbreviateInfo: "never" | "always" | "outside-selection";
  // and now we begin to abuse this for more than just settings...
  selections: { start: { line: number }; end: { line: number } }[];
  // ^^^ relevant subset of vscode.Selection
};

export type HVContext = HVContext1 & {
  hvContextUP?: UpdateProxy<HVContext1>;
};

export const defaultHVContext: HVContext = {
  detailsMode: "grid",
  showTimeSlider: false,
  showMessages: false,
  showTrace: false,
  showAST: false,
  abbreviateInfo: "outside-selection",
  selections: [],
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const HVContext = createContext<HVContext>(defaultHVContext);
