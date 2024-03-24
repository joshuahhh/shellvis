import { RawString } from '@automerge/automerge/next';
import { count } from '@engraft/shared/lib/count.js';
import { Tooltip } from '@mui/material';
import * as octicons from '@primer/octicons-react';
import clsx from 'clsx';
import sh from 'mvdan-sh';
import path from 'path-browserify';
import { Fragment, ReactNode, memo } from 'react';
import { DeltaLogEntry, ExecInfo, Trace, execStatus, mkExecId } from '../shared/execution.js';
import { Script, getNodeId } from '../shared/mvdan-sh-helpers.js';
import { ExecuteRequest } from '../shared/types.js';
import { ShellVar, ShellVarChange, diffShellVars, shellVarChangeVarName } from '../shared/typeset.js';
import { last, weakMapCache2 } from '../shared/util.js';
import tw from './tailwind-styled-component/index.js';


const octiconProps: Parameters<octicons.Icon>[0] = {
  verticalAlign: 'top',
};

type CallOnGridVProps = {
  callExpr: sh.CallExpr,
  context: string,
  trace: Trace,
  script: Script,
  showCodeLabel?: boolean,
  abbreviate: boolean,
};

export const CallOnGridV = memo((props: CallOnGridVProps) => {
  const {callExpr, context, trace, script, showCodeLabel = false, abbreviate} = props;

  const nodeId = getNodeId(callExpr);
  const execId = mkExecId({ context, nodeId });
  const execInfo = trace.execInfos[execId] as ExecInfo | undefined;
  const status = execStatus(execInfo);

  if (!execInfo) { return null; }

  const providerOutputs = getInfoProviderOutputs(execInfo, abbreviate);

  return (
    execInfo &&
    <div data-dbg='CallOnGridV'
      className='inline-flex flex-col items-start'>
      { showCodeLabel &&
        <div data-dg-name='CallOnGridV code label'
          className='text-gray-500 text-xs w-0 min-w-full whitespace-nowrap overflow-hidden text-ellipsis -mt-1'>
          {script.srcForNode(callExpr)}
        </div>
      }
      <div data-dbg='CallOnGridV filled area'
        className={clsx(
          `inline-flex flex-col bg-gray-500 rounded
          p-1
          min-w-5 min-h-5`,
          status === 'running' && '-ml-[3px] border-l-[3px] border-green-500',
          providerOutputs.length === 0 && 'bg-gray-600'
        )}
        data-exec-id={execId}
      >
        {providerOutputs}
      </div>
    </div>
  );
});

type CallInPlaceVProps = {
  header: ReactNode,
  callExpr: sh.CallExpr,
  context: string,
  trace: Trace,
  abbreviate: boolean,
};

export const CallInPlaceV = memo((props: CallInPlaceVProps) => {
  const {header, callExpr, context, trace, abbreviate} = props;

  const nodeId = getNodeId(callExpr);
  const execId = mkExecId({ context, nodeId });
  const execInfo = trace.execInfos[execId] as ExecInfo | undefined;
  const status = execStatus(execInfo);

  if (!execInfo) { return null; }

  const providerOutputs = getInfoProviderOutputs(execInfo, abbreviate);

  return (
    execInfo &&
    <div data-dbg='CallInPlaceV'
      className={clsx(
        'inline-flex flex-col bg-gray-500 rounded mb-1 mr-1',
        status === 'running' && '-ml-[3px] border-l-[3px] border-green-500',
        providerOutputs.length === 0 && 'bg-gray-600'
      )}
      data-exec-id={execId}
    >
      { header &&
        <div className='relative rounded'>
          <div className='absolute h-[20px] w-full bg-gray-600 rounded-t'/>
          <div className='relative px-2'>{header}</div>
        </div>
      }
      <div className='p-1'>
        {providerOutputs}
      </div>
    </div>
  );
});

function getInfoProviderOutputs(execInfo: ExecInfo, abbreviate: boolean): ReactNode[] {
  return (
    infoProviders.map((provider, i) =>
      [provider({ abbreviate: abbreviate, execInfo }), i] as const
    )
    .filter(([result]) => result)
    .map(([providerOutput, i]) =>
      <Fragment key={i}>
        {providerOutput}
      </Fragment>
    )
  );
}

// rest of this file is all just...

// *******************
// * info providers! *
// *******************

const InfoEntry = tw.div`flex gap-2`;

const InfoEntryIcon = memo((props: {
  title: string,
  children: ReactNode,
  className?: string,
}) => {
  const { title, children, className } = props;
  // TODO: mt depends on line height
  return <Tooltip title={title} placement='top' arrow className={clsx('w-4 h-4 relative mt-[2px]', className)}>
    <div>
      {children}
    </div>
  </Tooltip>;
});

const InfoEntryContents = tw.div`flex overflow-auto whitespace-nowrap`;

const InfoEntryDetails = tw.div`ml-2`;

// TODO: "computer" and "human"; figure this out
const C = tw.span`font-mono`;
const H = tw.span`italic text-gray-300`;

type InfoProvider = (props: InfoProviderProps) => ReactNode;

type InfoProviderProps = {
  abbreviate: boolean,
  execInfo: ExecInfo,
};

let infoProviders: InfoProvider[] = [];

// stdout & stderr
function infoProviderForStream(stream: 'stdout' | 'stderr'): InfoProvider {
  return ({ abbreviate, execInfo }: InfoProviderProps) => {
    const data = execInfo[stream].data;
    if (data.length > 0 && !execInfo.suppressed) {
      let contents: ReactNode;
      if (abbreviate) {
        const text = data.join('');
        const lines = text.split('\n');
        const numLines = lines.length - (last(lines) === '' ? 1 : 0);
        if (numLines <= 2) {
          contents = <pre>{text}</pre>;
        } else {
          contents = <div>
            <pre>{lines.slice(0, 1).join('\n')}</pre>
            <H>+ {count(numLines - 1, 'line', 'lines')}</H>
          </div>;
        }
      } else {
        contents = <pre>{data}</pre>;
      }
      return <InfoEntry>
        { stream === 'stdout'
          ? <InfoEntryIcon title='stdout'>
              <octicons.ArrowRightIcon {...octiconProps}/>
            </InfoEntryIcon>
          : <InfoEntryIcon title='stderr'>
              <octicons.CircleSlashIcon {...octiconProps}/>
            </InfoEntryIcon>
        }
        <InfoEntryContents>{contents}</InfoEntryContents>
      </InfoEntry>;
    }
  };
}
infoProviders.push(infoProviderForStream('stdout'));
infoProviders.push(infoProviderForStream('stderr'));

// effect
infoProviders.push(({ execInfo }) => {
  if (execInfo.suppressed && execInfo.exitInfo !== null) {
    return <InfoEntry key='suppressed'>
      <InfoEntryIcon title='effect'>
        <octicons.AlertIcon {...octiconProps}/>
      </InfoEntryIcon>
      <InfoEntryContents>
        <button onClick={async () => {
          await fetch(
            'http://localhost:8080/execute',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                command: execInfo.stdout.data.join(''),
                cwd: execInfo.enterCwd,
              } satisfies ExecuteRequest),
            }
          );
        }}>
          <pre>{execInfo.stdout.data}</pre>
        </button>
      </InfoEntryContents>
    </InfoEntry>;
  }
});

// delta log
const eventNames: Record<string, string> = {
  'deleted': 'file/dir deleted',
};
infoProviders.push(({ abbreviate, execInfo }) => {
  const deltaLog = execInfo?.deltaLog;
  if (deltaLog && deltaLog.length > 0) {
    if (abbreviate && deltaLog.length > 1) {
      let eventCounts: {[event: string]: number} = {
        'new file': 0,
        'new dir': 0,
        'deleted': 0,
        'modified': 0,
        'dir replaced with file': 0,
        'other': 0,
      };
      for (const entry of deltaLog) {
        if (entry.event in eventCounts) {
          eventCounts[entry.event] += 1;
        } else {
          eventCounts['other'] += 1;
        }
      }
      return <InfoEntry>
        {Object.entries(eventCounts).map(([event, count]) => {
          if (count > 0) {
            return <Fragment key={event}>
              {eventIcons[event] || <InfoEntryIcon title={event}><octicons.DiffIgnoredIcon {...octiconProps}/></InfoEntryIcon>}
              <InfoEntryContents>
                {count}
              </InfoEntryContents>
            </Fragment>;
          } else {
            return null;
          }
        })}
      </InfoEntry>;
    } else {
      return renderDeltaLog(deltaLog, execInfo.enterCwd);
    }
  }
});

// exit code
infoProviders.push(({ execInfo }) => {
  const execExitInfo = execInfo?.exitInfo;
  if (execExitInfo && execExitInfo.exitCode !== 0) {
    return <InfoEntry>
      <InfoEntryIcon title='exit code'>
        <octicons.SignOutIcon {...octiconProps}/>
      </InfoEntryIcon>
      <InfoEntryContents>
        <H>exit {execExitInfo.exitCode}</H>
      </InfoEntryContents>
    </InfoEntry>;
  }
});

// cwd
infoProviders.push(({ execInfo }) => {
  const execExitInfo = execInfo?.exitInfo;
  if (execExitInfo && execExitInfo.cwd !== execInfo.enterCwd) {
    return <InfoEntry>
      <InfoEntryIcon title='change dir'>
        <octicons.FileSubmoduleIcon {...octiconProps}/>
      </InfoEntryIcon>
      <div title={execExitInfo.cwd}>
        {path.relative(execInfo.enterCwd, execExitInfo.cwd)}
      </div>
    </InfoEntry>;
  }
});

// vars
infoProviders.push(({ abbreviate, execInfo }) => {
  if (execInfo && execInfo.varsEnterStr && execInfo.varsExitStr) {
    const varsDiff = diffShellVarsFromStr(execInfo.varsEnterStr, execInfo.varsExitStr);
    // TODO: make this principled, add feature to expand them
    const ignoredShellVarNames = ['pipestatus', 'PWD', 'OLDPWD', 'SECONDS'];
    const varsDiffRelevant = varsDiff.filter((change) => {
      return !ignoredShellVarNames.includes(shellVarChangeVarName(change));
    });
    if (varsDiffRelevant.length === 0) {
      return null;
    }
    if (abbreviate && varsDiffRelevant.length > 1) {
      let typeCounts: Record<ShellVarChange['type'], number> = {
        add: 0,
        remove: 0,
        changeValue: 0,
        changeAttributes: 0,
      };
      for (const change of varsDiffRelevant) {
        typeCounts[change.type] += 1;
      }
      return <InfoEntry>
        {Object.entries(typeCounts).map(([type, count]) => {
          if (count > 0) {
            return <Fragment key={type}>
              {varChangeIcons[type as ShellVarChange['type']]}
              <InfoEntryContents>
                {count}
              </InfoEntryContents>
            </Fragment>;
          } else {
            return null;
          }
        })}
      </InfoEntry>;
    } else {
      return varsDiffRelevant.map((change) =>
        <div key={`shellVarChange-${shellVarChangeVarName(change)}`}>
          {renderShellVarChange(change)}
        </div>
      );
    }
  }
});

const eventIcons: Record<string, ReactNode> = {
  'deleted': <InfoEntryIcon title='file/dir deleted'><octicons.DiffRemovedIcon {...octiconProps} /></InfoEntryIcon>,
  'new dir': <InfoEntryIcon title='dir added'><octicons.DiffAddedIcon {...octiconProps} /></InfoEntryIcon>,
  'modified': <InfoEntryIcon title='file modified'><octicons.DiffModifiedIcon {...octiconProps} /></InfoEntryIcon>,
  'dir replaced with file': <InfoEntryIcon title='dir to file'><octicons.DiffModifiedIcon {...octiconProps} /></InfoEntryIcon>,
  'new file': <InfoEntryIcon title='file added'><octicons.DiffAddedIcon {...octiconProps} /></InfoEntryIcon>,
};

// TODO: make into component?
function renderDeltaLog(log: DeltaLogEntry[], baseDir?: string): ReactNode {
  return <>
    {log.map(({path: somePath, event}) => {
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <InfoEntry key={somePath}>
        {eventIcons[event] || <InfoEntryIcon title={eventNames[event] || event}><octicons.DiffIgnoredIcon {...octiconProps}/></InfoEntryIcon>}
        <InfoEntryContents>
          <C>{somePath}</C>
          <InfoEntryDetails><H>({event})</H></InfoEntryDetails>
        </InfoEntryContents>
      </InfoEntry>;
    })}
  </>;
}


const varChangeIcons: Record<ShellVarChange['type'], ReactNode> = {
  add:
    <InfoEntryIcon title='var add' className='text-sky-300'>
      <octicons.DiffAddedIcon {...octiconProps}/>
    </InfoEntryIcon>,
  remove:
    <InfoEntryIcon title='var remove' className='text-sky-300'>
      <octicons.DiffRemovedIcon {...octiconProps}/>
    </InfoEntryIcon>,
  changeValue:
    <InfoEntryIcon title='var change' className='text-sky-300'>
      <octicons.DiffModifiedIcon {...octiconProps}/>
    </InfoEntryIcon>,
  changeAttributes:
    <InfoEntryIcon title='var change attrib' className='text-sky-300'>
      <octicons.DiffModifiedIcon {...octiconProps}/>
    </InfoEntryIcon>,
};

// TODO: make into component?
function renderShellVarChange(change: ShellVarChange): ReactNode {
  let contents: ReactNode;
  if (change.type === 'add') {
    contents = <>
      <C>{change.newVar.name}</C> = <C>{change.newVar.value}</C>
    </>;
  } else if (change.type === 'remove') {
    contents = <>
      <C>{change.oldVar.name}</C>
      <InfoEntryDetails><H>(← <C>{change.oldVar.value}</C>)</H></InfoEntryDetails>
    </>;
  } else if (change.type === 'changeValue') {
    contents = <>
      <C>{change.oldVar.name}</C>=<C>{change.newVar.value}</C>
      <InfoEntryDetails><H>(← <C>{change.oldVar.value}</C>)</H></InfoEntryDetails>
    </>;
  } else if (change.type === 'changeAttributes') {
    contents = <>
      <C>{change.newVar.name}</C> attributes: <C>{change.newVar.attributes}</C>
      <InfoEntryDetails><H>(← <C>{change.oldVar.attributes}</C>)</H></InfoEntryDetails>
    </>;
  } else {
    throw new Error(`unknown change type ${(change as any).type}`);
  }
  return <InfoEntry>
    {varChangeIcons[change.type]}
    <InfoEntryContents>{contents}</InfoEntryContents>
  </InfoEntry>;
}

const diffShellVarsFromStr = weakMapCache2((varsEnterStr: RawString, varsExitStr: RawString) => {
  const varsEnter: Record<string, ShellVar> = JSON.parse(varsEnterStr.val);
  const varsExit: Record<string, ShellVar> = JSON.parse(varsExitStr.val);
  const varsDiff = diffShellVars(varsEnter, varsExit);
  return varsDiff;
});
