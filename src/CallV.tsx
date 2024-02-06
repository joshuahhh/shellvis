import { RawString } from "@automerge/automerge/next";
import * as octicons from "@primer/octicons-react";
import sh from "mvdan-sh";
import path from "path-browserify";
import React, { memo, useContext, useEffect } from "react";
import { DeltaLogEntry, ExecInfo, Trace, mkExecId } from "../execution.js";
import { getNodeId } from "../mvdan-sh-helpers.js";
import { ShellVar, ShellVarChange, diffShellVars, shellVarChangeVarName } from "../typeset.js";
import { weakMapCache2 } from "../util.js";
import { HVContext } from "./HVContext.js";

const { ChevronRightIcon, DiffAddedIcon, DiffIgnoredIcon, DiffModifiedIcon, DiffRemovedIcon, FileSubmoduleIcon, SignOutIcon } = octicons;


type CallVProps = {
  contents: React.ReactNode,
  callExpr: sh.CallExpr,
  context: string,
  trace: Trace,
}

export const CallV = memo((props: CallVProps) => {
  const {contents, callExpr, context, trace} = props;

  const nodeId = getNodeId(callExpr);
  const execId = mkExecId(context, nodeId);
  const execInfo = trace.execInfos[execId] as ExecInfo | undefined;
  const execExitInfo = execInfo?.exitInfo;
  const statusClass =
    execInfo
    ? execExitInfo
      ? execExitInfo.exitCode === 0
        ? 'call--done-success'
        : 'call--done-failure'
      : 'call--running'
    : 'call--not-started';

  const infoSections: React.ReactNode[] = [];
  if (execInfo && execInfo.stdout.data.length > 0) {
    infoSections.push(
      <div key="stdout" style={{fontSize: '80%'}}>
        <div className="info-entry">
          <ChevronRightIcon/>
          <pre>
            {execInfo.stdout.data}
          </pre>
        </div>
      </div>
    );
  }
  if (execInfo && execInfo.stderr.data.length > 0) {
    infoSections.push(
      <div key="stderr" style={{fontSize: '80%'}}>
        <div className="info-entry" style={{}}>
          <div style={{position: 'relative', width: 16, height: 16}}>
            <div style={{position: 'absolute', left: 3}}>
              <ChevronRightIcon/>
            </div>
            <div style={{position: 'absolute', left: -3}}>
              <ChevronRightIcon/>
            </div>
          </div>
          <pre>
            {execInfo.stderr.data}
          </pre>
        </div>
      </div>,
    );
  }
  if (execExitInfo && execExitInfo.deltaLog.length > 0) {
    infoSections.push(
      <div key="deltalog" style={{fontSize: '80%'}}>
        {renderDeltaLog(execExitInfo.deltaLog, execInfo.enterCwd)}
      </div>,
    );
  }
  if (execExitInfo && execExitInfo.exitCode !== 0) {
    infoSections.push(
      <div key="exitcode" className="info-entry" style={{fontSize: '80%'}}>
        <SignOutIcon/>
        <div>
          exit {execExitInfo.exitCode}
        </div>
      </div>
    );
  }
  if (execExitInfo && execExitInfo.cwd !== execInfo.enterCwd) {
    infoSections.push(
      <div key="cwd" style={{fontSize: '80%'}} title={execExitInfo.cwd}>
        <div className="info-entry">
          <FileSubmoduleIcon/>
          {path.relative(execInfo.enterCwd, execExitInfo.cwd)}
        </div>
      </div>
    );
  }
  if (execInfo && execInfo.varsEnterStr && execInfo.varsExitStr) {
    const varsDiff = diffShellVarsFromStr(execInfo.varsEnterStr, execInfo.varsExitStr);
    // TODO: make this principled, add feature to expand them
    const ignoredShellVarNames = ['pipestatus', 'PWD', 'OLDPWD', 'SECONDS']
    varsDiff.forEach((change) => {
      if (ignoredShellVarNames.includes(shellVarChangeVarName(change))) {
        return;
      }
      infoSections.push(
        <div key={`shellVarChange-${shellVarChangeVarName(change)}`} style={{fontSize: '80%'}}>
          {renderShellVarChange(change)}
        </div>
      );
    });
  }
  if (false) {
    infoSections.push(
      <div style={{fontStyle: 'italic', fontSize: '60%'}}>{nodeId}</div>
    );
  }

  const { showCallDetails } = useContext(HVContext);
  const showDetails = showCallDetails && infoSections.length > 0;

  return <div key={nodeId} className={`call ${statusClass} ${!showDetails ? 'call--no-info-sections' : ''}`}>
    <div className="call__code">
      <div className="call__code-background"/>
      <div className="call__code-contents">{contents}</div>
    </div>
    <div className={`call__info-wrapper ${showDetails ? 'open' : ''}`}>
      <div style={{overflow: 'hidden'}}>
        { true &&
          <div className="call__info">
            {infoSections}
          </div>
        }
      </div>
    </div>
  </div>
});


const eventIcons: Record<string, React.ReactNode> = {
  'deleted': <DiffRemovedIcon />,
  'new dir': <DiffAddedIcon />,
  'modified': <DiffModifiedIcon />,
  'dir replaced with file': <DiffModifiedIcon />,
  'new file': <DiffAddedIcon />,
}

// TODO: make into component?
function renderDeltaLog(log: DeltaLogEntry[], baseDir?: string): React.ReactNode {
  return <>
    {log.map(({path: somePath, event}) => {
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <div key={somePath} className="info-entry">
        <div className="info-entry__icon">
          {eventIcons[event] || <DiffIgnoredIcon/>}
        </div>
        <div className="info-entry__contents">{somePath}</div>
        <div className="info-entry__details">({event})</div>
      </div>
    })}
  </>
}

// TODO: make into component?
function renderShellVarChange(change: ShellVarChange): React.ReactNode {
  if (change.type === 'add') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffAddedIcon/></div>
      <div className="info-entry__contents">{change.newVar.name} = {change.newVar.value}</div>
    </div>;
  } else if (change.type === 'remove') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffRemovedIcon/></div>
      <div className="info-entry__contents">{change.oldVar.name}</div>
      <div className="info-entry__details">(← {change.oldVar.value})</div>
    </div>;
  } else if (change.type === 'changeValue') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffModifiedIcon/></div>
      <div className="info-entry__contents">{change.oldVar.name} = {change.newVar.value}</div>
      <div className="info-entry__details">(← {change.oldVar.value})</div>
    </div>;
  } else if (change.type === 'changeAttributes') {
    return <div className="info-entry">
      <div className="info-entry__icon shell-var-icon"><DiffModifiedIcon/></div>
      <div className="info-entry__contents">{change.newVar.name} attributes: {change.newVar.attributes}</div>
      <div className="info-entry__details">(← {change.oldVar.attributes})</div>
    </div>;
  } else {
    throw new Error(`unknown change type ${(change as any).type}`);
  }
}

const diffShellVarsFromStr = weakMapCache2((varsEnterStr: RawString, varsExitStr: RawString) => {
  const varsEnter: Record<string, ShellVar> = JSON.parse(varsEnterStr.val);
  const varsExit: Record<string, ShellVar> = JSON.parse(varsExitStr.val);
  const varsDiff = diffShellVars(varsEnter, varsExit);
  return varsDiff;
});
