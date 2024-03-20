import { createContext } from "react";
import * as vscode from 'vscode';

export type HVContext = {
  detailsMode: 'grid' | 'in-place',  // todo:  | 'one-by-one' | 'none'
  showMessages: boolean,
  showTrace: boolean,
  showAST: boolean,
  abbreviateInfo: 'never' | 'always' | 'outside-selection',
  // and now we begin to abuse this for more than just settings...
  selections: vscode.Selection[],
}

export const defaultHVContext: HVContext = {
  detailsMode: 'grid',
  showMessages: false,
  showTrace: false,
  showAST: false,
  abbreviateInfo: 'outside-selection',
  selections: [],
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export const HVContext = createContext<HVContext>(defaultHVContext);
