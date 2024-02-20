import { useUpdateProxy } from "@engraft/update-proxy-react";
import AnsiToHtml from "ansi-to-html";
import sh from "mvdan-sh";
import React, { Fragment, memo, useMemo } from "react";
import * as util from "util";
import { Trace } from "../execution.js";
import { Script, expandObject } from "../mvdan-sh-helpers.js";
import { Message } from "../tracing.js";
import { HVContext, defaultHVContext } from "./HVContext.js";
import { TraceV } from "./TraceV.js";


const ansiToHtml = new AnsiToHtml({});

type TraceViewerVProps = {
  trace: Trace,
  optionalScript?: Script,
}

const parser = sh.syntax.NewParser();

export const TraceViewerV = memo((props: TraceViewerVProps) => {
  const { trace, optionalScript } = props;

  const [ hvContext, setHVContext ] = React.useState<HVContext>(defaultHVContext);
  const { showMessages, showAST } = hvContext;

  const hvContextUP = useUpdateProxy(setHVContext);

  const script = useMemo(() => {
    // TODO ugly ugly
    try {
      return optionalScript || new Script(parser, trace.scriptSrc);
    } catch (e) {
      return new Script(parser, '');
    }
  }, [optionalScript, trace.scriptSrc]);

  if (trace.parseError) {
    return <div>
      <h1>parse error</h1>
      <pre>{trace.parseError}</pre>
    </div>;
  }

  const partTransformed = () => trace.transformedSrc && <div>
    <h1>transformed</h1>
    <pre>
      {trace.transformedSrc.split('\n').map((line, i) =>
        `${String(i + 1).padStart(3)} ${line}
      `).join('\n')}
    </pre>
  </div>;

  const partAST = () => <div>
    <h1>ast</h1>
    {inspectHtml(expandObject(script.ast))}
  </div>;

  const partMessages = () => <div className="row">
    <div>
      <h1>messages</h1>
      <ul>
        {trace.messageLog.map((entry, i) =>
          <li key={i}>
            <MessageV message={entry} script={script} />
          </li>
        )}
      </ul>
    </div>
  </div>;

  const partExecInfo = () => <div>
    <h1>exec info</h1>
    <dl>
      {Object.entries(trace.execInfos).map(([execId, execInfo]) => {
        const { stdout, stderr, ...rest } = execInfo;
        return <Fragment key={execId}>
          <dt>{execId}</dt>
          <dd>
            <div><b>stdout</b> {stdout.done && <small>✓</small>}</div>
            <pre>{stdout.data}</pre>
            <div><b>stderr</b> {stderr.done && <small>✓</small>}</div>
            <pre>{stderr.data}</pre>
            <div><b>rest</b>
              {inspectHtml(rest)}
            </div>
          </dd>
        </Fragment>
      })}
    </dl>
  </div>;

  const partForInfo = () => <div>
    <h1>for info</h1>
    <dl>
      {Object.entries(trace.forInfos).map(([execId, forInfo]) => {
        return <Fragment key={execId}>
          <dt>{execId}</dt>
          <dd>
            <div><b>iterations</b></div>
            <ul>
              {forInfo.iterations.map((iteration, i) => <li key={i}>
                <div><b>counter</b> {iteration.counter}</div>
                <div><b>loopVarValue</b> {iteration.loopVarValue}</div>
              </li>)}
            </ul>
          </dd>
        </Fragment>
      })}
    </dl>
  </div>;

  return <HVContext.Provider value={hvContext}>
    <TraceV trace={trace} script={script} />

    <div className="row" style={{marginTop: 30}}></div>

    {showMessages && partMessages()}
    {false && partTransformed()}
    {showAST && partAST()}
    {false && partExecInfo()}
    {false && partForInfo()}
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <label>
        Details mode:
        <select
          value={hvContext.detailsMode}
          onChange={(e) => hvContextUP.detailsMode.$set(e.target.value as any)}
          style={{marginLeft: 10}}
        >
          <option value="grid">grid</option>
          <option value="in-place">in-place</option>
          <option value="on-side">on-side</option>
          <option value="one-by-one">one-by-one</option>
          <option value="none">none</option>
        </select>
      </label>
      <label>
        On-side layout:
        <select
          value={hvContext.onSideLayout}
          onChange={(e) => hvContextUP.onSideLayout.$set(e.target.value as any)}
          style={{marginLeft: 10}}
        >
          <option value="smart">smart</option>
          <option value="mid">mid</option>
          <option value="dumb">dumb</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={hvContext.showMessages}
          onChange={(e) => hvContextUP.showMessages.$set(e.target.checked)}
          style={{marginRight: 10}}
        />
        Show messages
      </label>
      <label>
        <input
          type="checkbox"
          checked={hvContext.showAST}
          onChange={(e) => setHVContext((hvContext) => ({ ...hvContext, showAST: e.target.checked }))}
          style={{marginRight: 10}}
        />
        Show AST
      </label>
    </div>
  </HVContext.Provider>;
});

const MessageV = memo((props: { message: Message, script: Script }) => {
  const { message, script } = props;

  return <div>
    { message.nodeId &&
      <div style={{display: 'inline-block', border: '1px solid gray', padding: 4}}>
        <pre>{script.srcForNode(script.nodesById[message.nodeId])}</pre>
      </div>
    }
    { inspectHtml(message) }
  </div>
});

function inspectHtml(value: any) {
  return <pre dangerouslySetInnerHTML={{ __html:
    ansiToHtml.toHtml(util.inspect(value, { showHidden: false, depth: null, colors: true }))
  }} />;
}
