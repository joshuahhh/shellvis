import express from "express";
import sh from "mvdan-sh";
import * as child_process from "node:child_process";
import * as fsOld from "node:fs";
import * as fs from "node:fs/promises";
import { Server } from "node:http";
import * as path from "node:path";
import * as os from "os";
import { renderToString } from "react-dom/server";
import * as tmp from "tmp";
import { ExecInfo, ForInfo, PipeProgress, Trace, mkExecId, parseDeltaLog } from "./execution";
import { OnlyRunLatestJob } from "./job-stuff";
import { Script, getNodeId, hasNodeType, myWalk, wrapStmt } from "./mvdan-sh-helpers";
import { TraceV } from "./render";
import { diffShellVars, parseTypeset } from "./typeset";

export type Message =
  | {
      type: 'debug',
      [key: string]: any,
    }
  | {
      type: 'call-enter',
      nodeId: string,
      context: string,
      cwd: string,
    }
  | {
      type: 'call-exit',
      nodeId: string,
      context: string,
      cwd: string,
      exitCode: number,
    }
  | {
      type: 'for-body-enter',
      nodeId: string,
      context: string,
      counter: number,
      loopVarValue: string,
    }
  | {
      type: 'for-body-exit',
      nodeId: string,
      context: string,
    };
