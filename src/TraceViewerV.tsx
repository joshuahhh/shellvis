import { useUpdateProxy } from "@engraft/update-proxy-react";
import React, { memo } from "react";
import { Trace } from "../execution.js";
import { Script } from "../mvdan-sh-helpers.js";
import { HVContext, defaultHVContext } from "./HVContext.js";
import { TraceV } from "./TraceV.js";

type TraceViewerVProps = {
  trace: Trace,
  optionalScript?: Script,
}

export const TraceViewerV = memo((props: TraceViewerVProps) => {
  const [ hvContext, setHVContext ] = React.useState<HVContext>(defaultHVContext);

  const hvContextUP = useUpdateProxy(setHVContext);

  return <HVContext.Provider value={hvContext}>
    <TraceV {...props} />
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
