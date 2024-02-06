import { createContext } from "react";

export type HVContext = {
  showCallDetails: boolean,
  showMessages: boolean,
}

export const defaultHVContext: HVContext = {
  showCallDetails: true,
  showMessages: false,
};

export const HVContext = createContext<HVContext>(defaultHVContext);
