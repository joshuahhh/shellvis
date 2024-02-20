import { memo, useContext } from "react";
import { Trace } from "../execution.js";
import { Script } from "../mvdan-sh-helpers.js";
import { HVContext } from "./HVContext.js";
import { TraceInPlaceAndGridV } from "./TraceInPlaceAndGridV.js";
import { TraceOnSideV } from "./TraceOnSideV.js";

export type TraceVProps = {
  trace: Trace,
  script: Script,
}

export const TraceV = memo((props: TraceVProps) => {
  const { detailsMode } = useContext(HVContext);

  if (detailsMode === 'in-place' || detailsMode === 'grid') {
    return <TraceInPlaceAndGridV {...props}/>;
  } else if (detailsMode === 'on-side') {
    return <TraceOnSideV {...props}/>;
  } else {
    return <div>unknown details mode {detailsMode}</div>;
  }
});
