import { createContext } from "react";

export type HVContext = {
  detailsMode: 'in-place' | 'on-side' | 'one-by-one' | 'none',
  showMessages: boolean,
}

export const defaultHVContext: HVContext = {
  detailsMode: 'on-side',
  showMessages: false,
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const HVContext = createContext<HVContext>(defaultHVContext);
