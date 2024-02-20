import { createContext } from "react";

export type HVContext = {
  detailsMode: 'in-place' | 'on-side' | 'one-by-one' | 'none',
  onSideLayout: 'smart' | 'mid' | 'dumb',
  showMessages: boolean,
  showAST: boolean,
}

export const defaultHVContext: HVContext = {
  detailsMode: 'on-side',
  onSideLayout: 'smart',
  showMessages: false,
  showAST: false,
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const HVContext = createContext<HVContext>(defaultHVContext);
