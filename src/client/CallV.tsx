import { RawString } from '@automerge/automerge/next';
import { count } from '@engraft/shared/lib/count.js';
import { Tooltip } from '@mui/material';
import * as octicons from '@primer/octicons-react';
import sh from 'mvdan-sh';
import path from 'path-browserify';
import { Fragment, ReactNode, memo } from 'react';
import { DeltaLogEntry, ExecInfo, Trace, execStatus, mkExecId, pipeData } from '../shared/execution.js';
import { Script, getNodeId } from '../shared/mvdan-sh-helpers.js';
import { ExecuteRequest } from '../shared/types.js';
import { ShellVar, ShellVarChange, diffShellVars, shellVarChangeVarName } from '../shared/typeset.js';
import { last, objectEntries, weakMapCache2 } from '../shared/util.js';
import { clsy } from './clsy.js';
import tw from './tailwind-styled-component/index.js';
import diffViewerModule, { DiffMethod } from 'react-diff-viewer-continued';

const ReactDiffViewer = diffViewerModule as any as typeof diffViewerModule.default;

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
    <div data-dbg='CallOnGridV'
      className='inline-flex flex-col items-start min-w-0'>
      { showCodeLabel &&
        <div data-dg-name='CallOnGridV code label' className='text-gray-500 text-xs w-0 min-w-full whitespace-nowrap overflow-hidden text-ellipsis font-mono'>
          {script.srcForNode(callExpr)}
        </div>
      }
      <div data-dbg='CallOnGridV filled area'
        className={clsy(
          `inline-flex flex-col rounded
          ${status === 'done-failure' ? 'bg-red-900' : 'bg-gray-500'}
          p-1
          min-w-7 min-h-7
          max-w-full
          max-h-72 overflow-x-auto
          ${!abbreviate && 'border-b-[#1F1F1F] border-b-2'}
          `,
          status === 'running' && 'loading-animation'
          // providerOutputs.length === 0 && 'bg-gray-600'
        )}
        data-exec-id={execId}
      >
        {status === 'done-success' && providerOutputs.length === 0 ?
          <div className='opacity-50'>
            ok
          </div> :
          providerOutputs
        }
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
      className={clsy(
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
  return <Tooltip title={title} placement='top' arrow className={clsy('w-4 h-4 relative mt-[2px]', className)}>
    <div>
      {children}
    </div>
  </Tooltip>;
});

const InfoEntryContents = tw.div`flex overflow-auto whitespace-nowrap items-center`;

const InfoEntryDetails = tw.div`pl-2 min-w-0 overflow-x-auto`;

// TODO: "computer" and "human"; figure this out
const C = tw.span`font-mono`;
const H = tw.span`italic text-gray-400 text-sm pr-1`;

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
        contents = <pre>{data.map((s) => s.val)}</pre>;
      }
      return <InfoEntry>
        { stream === 'stdout'
          ? <InfoEntryIcon title='stdout'>
              <octicons.ArrowRightIcon {...octiconProps}/>
            </InfoEntryIcon>
          : <InfoEntryIcon title='stderr'>
              <div style={{position: 'absolute', left: 3}}>
                <octicons.ArrowRightIcon {...octiconProps}/>
              </div>
              <div style={{position: 'absolute', left: -3}}>
                <octicons.ArrowRightIcon {...octiconProps}/>
              </div>
            </InfoEntryIcon>
        }
        <InfoEntryDetails>
          {contents}
        </InfoEntryDetails>
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
      <InfoEntryDetails>
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
          <pre>{pipeData(execInfo.stdout)}</pre>
        </button>
      </InfoEntryDetails>
    </InfoEntry>;
  }
});

// delta log
const eventNames: Record<DeltaLogEntry['event'], string> = {
  deletedDir: 'dir deleted',
  deletedFile: 'file deleted',
  dirReplacedWithFile: 'dir replaced with file',
  modifiedFile: 'modified',
  newDir: 'new dir',
  newFile: 'new file',
};
infoProviders.push(({ abbreviate, execInfo }) => {
  const deltaLog = execInfo?.deltaLog;
  if (deltaLog && deltaLog.length > 0) {
    if (abbreviate && deltaLog.length > 1) {
      let eventCounts: Record<DeltaLogEntry['event'], number> = {
        deletedDir: 0,
        deletedFile: 0,
        dirReplacedWithFile: 0,
        modifiedFile: 0,
        newDir: 0,
        newFile: 0,
      };
      for (const entry of deltaLog) {
        if (entry.event in eventCounts) {
          eventCounts[entry.event] += 1;
        } else {
          throw new Error(`unknown event ${entry.event}`);
        }
      }
      return <InfoEntry>
        {objectEntries(eventCounts).map(([event, count]) => {
          if (count > 0) {
            return <Fragment key={event}>
              <InfoEntryIcon title={eventNames[event] || event}>{eventIcons[event]}</InfoEntryIcon>
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
      return renderDeltaLog(deltaLog, execInfo.enterCwd, abbreviate);
    }
  }
});

const eventIcons: Record<DeltaLogEntry['event'], ReactNode> = {
  deletedDir: <octicons.DiffRemovedIcon {...octiconProps} />,
  deletedFile: <octicons.DiffRemovedIcon {...octiconProps} />,
  dirReplacedWithFile: <octicons.DiffModifiedIcon {...octiconProps} />,
  modifiedFile: <octicons.DiffModifiedIcon {...octiconProps} />,
  newDir: <octicons.DiffAddedIcon {...octiconProps} />,
  newFile: <octicons.DiffAddedIcon {...octiconProps} />,
};

// TODO: make into component?
function renderDeltaLog(log: DeltaLogEntry[], baseDir: string, abbreviate: boolean): ReactNode {
  return <>
    {log.map((entry) => {
      let {path: somePath, event} = entry;
      if (baseDir) {
        somePath = path.relative(baseDir, somePath);
      }
      return <InfoEntry key={somePath}>
        <InfoEntryIcon title={eventNames[event] || event}>{eventIcons[event]}</InfoEntryIcon>
        <div>
          <InfoEntryContents >
            <C>{somePath}</C>
            <InfoEntryDetails><H>({eventNames[event]})</H></InfoEntryDetails>
          </InfoEntryContents>
        { !abbreviate && entry.event === 'modifiedFile' &&
            <ReactDiffViewer
              oldValue={ entry.oldContents.toString() }
              newValue={ entry.newContents.toString() }
              splitView={false}
              useDarkTheme={true}
              disableWordDiff={true}
              compareMethod={DiffMethod.LINES}
              styles={{
                gutter: { minWidth: 0, padding: '0 5px' },
              }}
            />
          }
        </div>
      </InfoEntry>;
    })}
  </>;
}

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
              <InfoEntryDetails>
                {count}
              </InfoEntryDetails>
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
      <Tooltip title={<H>was <C>{change.oldVar.value}</C></H>} placement='top' arrow>
        <div><C>{change.oldVar.name}</C></div>
      </Tooltip>
    </>;
  } else if (change.type === 'changeValue') {
    contents = <>
      <Tooltip title={<H>was <C>{change.oldVar.value}</C></H>} placement='top' arrow>
        <div><C>{change.oldVar.name}</C>=<C>{change.newVar.value}</C></div>
      </Tooltip>
    </>;
  } else if (change.type === 'changeAttributes') {
    contents = <>
      <Tooltip title={<H>was <C>{change.oldVar.attributes}</C></H>} placement='top' arrow>
        <div><C>{change.newVar.name}</C> attributes: <C>{change.newVar.attributes}</C></div>
      </Tooltip>
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

// exit code
infoProviders.push(({ execInfo }) => {
  const execExitInfo = execInfo?.exitInfo;
  if (execExitInfo && execExitInfo.exitCode !== 0) {
    return <InfoEntry>
      <InfoEntryIcon title='exit code'>
        <octicons.SignOutIcon {...octiconProps}/>
      </InfoEntryIcon>
      <InfoEntryDetails>
        exit {execExitInfo.exitCode}
      </InfoEntryDetails>
    </InfoEntry>;
  }
});
