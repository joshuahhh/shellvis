import { createContext } from "react";
import * as vscode from 'vscode';

export type HVContext = {
  detailsMode: 'grid' | 'in-place' | 'on-side',  // todo:  | 'one-by-one' | 'none'
  onSideLayout: 'smart' | 'mid' | 'dumb',
  showMessages: boolean,
  showTrace: boolean,
  showAST: boolean,
  // and now we begin to abuse this for more than just settings...
  selections: vscode.Selection[],
}

export const defaultHVContext: HVContext = {
  detailsMode: 'grid',
  onSideLayout: 'smart',
  showMessages: false,
  showTrace: false,
  showAST: false,
  selections: [],
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const HVContext = createContext<HVContext>(defaultHVContext);
