import { createContext } from "react";

export type HVContext = {
  detailsMode: 'in-place' | 'on-side' | 'one-by-one' | 'none',
  showMessages: boolean,
}

export const defaultHVContext: HVContext = {
  detailsMode: 'in-place',
  showMessages: false,
};

export const HVContext = createContext<HVContext>(defaultHVContext);
