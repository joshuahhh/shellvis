import { RawString } from "@automerge/automerge/next";
import { Tooltip } from "@mui/material";
import * as octicons from "@primer/octicons-react";
import sh from "mvdan-sh";
import path from "path-browserify";
import React, { memo } from "react";
import { DeltaLogEntry, ExecInfo, Trace, mkExecId } from "../execution.js";
import { getNodeId } from "../mvdan-sh-helpers.js";
import { ExecuteRequest } from "../types.js";
import { ShellVar, ShellVarChange, diffShellVars, shellVarChangeVarName } from "../typeset.js";
import { weakMapCache2 } from "../util.js";
import classNames from "classnames";


type CallVProps = {
  contents: React.ReactNode,
  callExpr: sh.CallExpr,
  context: string,
  trace: Trace,
  className?: string,
  showHeader?: boolean,
  showDetails?: boolean,
}

export const InfoEntryIcon = memo((props: {
  title: string,
  children: React.ReactNode,
  className?: string,
}) => {
  const { title, children, className } = props;
  return <Tooltip title={title} arrow className={classNames('info-entry__icon', className)}>
    <div>
      {children}
    </div>
  </Tooltip>
});

export const CallV = memo((props: CallVProps) => {
  const {contents, callExpr, context, trace, className, showHeader = true, showDetails} = props;

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
  if (execInfo && execInfo.stdout.data.length > 0 && !execInfo.suppressed) {
    infoSections.push(
      <div key="stdout" style={{fontSize: '80%'}}>
        <div className="info-entry">
          <InfoEntryIcon title="stdout">
            <octicons.ChevronRightIcon/>
          </InfoEntryIcon>
          <div className="info-entry__contents">
            <pre>
              {execInfo.stdout.data}
            </pre>
          </div>
        </div>
      </div>
    );
  }
  if (execInfo && execInfo.stderr.data.length > 0) {
    infoSections.push(
      <div key="stderr" style={{fontSize: '80%'}}>
        <div className="info-entry" style={{}}>
          <InfoEntryIcon title="stderr">
            <div style={{position: 'relative', width: 16, height: 16}}>
              <div style={{position: 'absolute', left: 3}}>
                <octicons.ChevronRightIcon/>
              </div>
              <div style={{position: 'absolute', left: -3}}>
                <octicons.ChevronRightIcon/>
              </div>
            </div>
          </InfoEntryIcon>
          <div className="info-entry__contents">
            <pre>
              {execInfo.stderr.data}
            </pre>
          </div>
        </div>
      </div>,
    );
  }
  if (execInfo && execInfo.suppressed && execInfo.exitInfo !== null) {
    infoSections.push(
      <div key="suppressed" style={{fontSize: '80%'}}>
        <div className="info-entry">
          <InfoEntryIcon title="effect">
            <octicons.AlertIcon/>
          </InfoEntryIcon>
          <div className="info-entry__contents">
            <button onClick={async () => {
              await fetch(
                "http://localhost:8080/execute",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    command: execInfo.stdout.data.join(''),
                    cwd: execInfo.enterCwd,
                  } satisfies ExecuteRequest),
                }
              )
            }}>
              <pre>
                {execInfo.stdout.data}
              </pre>
            </button>
          </div>
        </div>
      </div>
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
        <InfoEntryIcon title="exit code">
          <octicons.SignOutIcon/>
        </InfoEntryIcon>
        <div className="info-entry__contents">
          exit {execExitInfo.exitCode}
        </div>
      </div>
    );
  }
  if (execExitInfo && execExitInfo.cwd !== execInfo.enterCwd) {
    infoSections.push(
      <div key="cwd" style={{fontSize: '80%'}}>
        <div className="info-entry">
          <InfoEntryIcon title="change dir">
            <octicons.FileSubmoduleIcon/>
          </InfoEntryIcon>
          <div title={execExitInfo.cwd}>
            {path.relative(execInfo.enterCwd, execExitInfo.cwd)}
          </div>
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

  return <div
    key={nodeId}
    className={`call ${statusClass} ${!showDetails ? 'call--no-info-sections' : ''} ${className || ''}`}
    data-exec-id={execId}
  >
    { showHeader &&
      <div className="call__code">
        <div className="call__code-background"/>
        <div className="call__code-contents">{contents}</div>
      </div>
    }
    <div className={`call__info-wrapper ${showDetails ? 'open' : ''}`}>
      <div style={{overflow: 'hidden'}}>
        <div className="call__info">
          {infoSections}
        </div>
      </div>
    </div>
  </div>
});


const eventIcons: Record<string, React.ReactNode> = {
  'deleted': <InfoEntryIcon title="deleted"><octicons.DiffRemovedIcon /></InfoEntryIcon>,
  'new dir': <InfoEntryIcon title="dir added"><octicons.DiffAddedIcon /></InfoEntryIcon>,
  'modified': <InfoEntryIcon title="modified"><octicons.DiffModifiedIcon /></InfoEntryIcon>,
  'dir replaced with file': <InfoEntryIcon title="dir to file"><octicons.DiffModifiedIcon /></InfoEntryIcon>,
  'new file': <InfoEntryIcon title="file added"><octicons.DiffAddedIcon /></InfoEntryIcon>,
}

// TODO: make into component?
function renderDeltaLog(log: DeltaLogEntry[], baseDir?: string): React.ReactNode {
  return <>
    {log.map(({path: somePath, event}) => {
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <div key={somePath} className="info-entry">
        {eventIcons[event] || <InfoEntryIcon title={event}><octicons.DiffIgnoredIcon/></InfoEntryIcon>}
        <div className="info-entry__contents info-entry__contents--no-wrap">
          {somePath}
          <span className="info-entry__details">({event})</span>
        </div>
      </div>
    })}
  </>
}

// TODO: make into component?
function renderShellVarChange(change: ShellVarChange): React.ReactNode {
  if (change.type === 'add') {
    return <div className="info-entry">
      <InfoEntryIcon title="var add" className="shell-var-icon">
        <octicons.DiffAddedIcon/>
      </InfoEntryIcon>
      <div className="info-entry__contents">{change.newVar.name} = {change.newVar.value}</div>
    </div>;
  } else if (change.type === 'remove') {
    return <div className="info-entry">
      <InfoEntryIcon title="var remove" className="shell-var-icon">
        <octicons.DiffRemovedIcon/>
      </InfoEntryIcon>
      <div className="info-entry__contents">
        {change.oldVar.name}{' '}
        <div className="info-entry__details">(← {change.oldVar.value})</div>
      </div>
    </div>;
  } else if (change.type === 'changeValue') {
    return <div className="info-entry">
      <InfoEntryIcon title="var change" className="shell-var-icon">
        <octicons.DiffModifiedIcon/>
      </InfoEntryIcon>
      <div className="info-entry__contents">
        {change.oldVar.name} = {change.newVar.value}{' '}
        <div className="info-entry__details">(← {change.oldVar.value})</div>
      </div>
    </div>;
  } else if (change.type === 'changeAttributes') {
    return <div className="info-entry">
      <InfoEntryIcon title="var change attrib" className="shell-var-icon">
        <octicons.DiffModifiedIcon/>
      </InfoEntryIcon>
      <div className="info-entry__contents">
        {change.newVar.name} attributes: {change.newVar.attributes}{' '}
        <div className="info-entry__details">(← {change.oldVar.attributes})</div>
      </div>
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
