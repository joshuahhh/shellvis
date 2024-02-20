import { memo, useContext } from "react";
import { LineTreeNodeV } from "./LineTreeNodeV.js";
import { TraceVProps } from "./TraceV.js";
import { HVContext } from "./HVContext.js";

export const TraceInPlaceAndGridV = memo((props: TraceVProps) => {
  const { trace, script } = props;
  const { detailsMode } = useContext(HVContext);

  return <div className={`trace detailsMode-${detailsMode}`}>
    {script.lineTree.map((node, i) =>
      <LineTreeNodeV key={i} script={script} trace={trace} node={node} context=""/>
    )}
  </div>;
});
