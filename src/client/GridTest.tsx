import { memo, useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";

export const GridTest = memo(() => {
  const widths = [100, 200, 400];

  const [gTC, setGTC] = useState(
    "fit-content(0%)_minmax(0,max-content)_minmax(min-content,max-content)_1fr",
  );

  return (
    <div className="px-16 mt-4">
      <h1 className="text-4xl mb-6 text-gray-300">grid test</h1>
      <p>ok this is wip ok</p>
      <pre></pre>
      {widths.map((width, i) => (
        <div key={i} style={{ width, maxWidth: width }} className="bg-gray-600">
          <div className="inline-grid grid-cols-[fit-content(0%)_minmax(0,max-content)_minmax(min-content,max-content)_1fr]">
            <TrackLabels numTracks={4} />
            <TestBlock className="bg-blue-500">hi</TestBlock>
            <TestBlock className="mt-6 bg-orange-500">
              helloooooooooooo there
            </TestBlock>
            <TestBlock className="mt-12 bg-indigo-500">how are you</TestBlock>
          </div>
        </div>
      ))}
    </div>
  );
});

const TrackLabels = memo((props: { numTracks: number }) => {
  const { numTracks } = props;
  return Array.from({ length: numTracks }).map((_, i) => {
    return (
      <div key={i} className="text-gray-300 text-sm text-center relative h-6">
        <Disconnect>{i}</Disconnect>
        <div className="absolute right-0 w-px h-full bg-gray-300" />
      </div>
    );
  });
});

// MUST set parent to relative
const Disconnect = memo((props: { children?: React.ReactNode }) => {
  return <div className="absolute left-0 top-0">{props.children}</div>;
});

const TestBlock = memo(
  (props: { children?: React.ReactNode; className?: string }) => {
    const { className } = props;
    const [widthStats, setWidthStats] = useState<ReturnType<
      typeof getWidthStats
    > | null>(null);
    const setDiv = useCallback((elem: HTMLDivElement | null) => {
      if (!elem) {
        return;
      }
      setWidthStats(getWidthStats(elem));
    }, []);
    return (
      <div
        ref={setDiv}
        className={twMerge(
          "h-6 rounded flex bg-slate-500 relative overflow-y-clip",
          className,
        )}
      >
        {props.children}
        {widthStats && (
          <div
            className="absolute w-px h-full bg-gray-300"
            style={{ left: widthStats.minContent - 1 }}
          />
        )}
        {widthStats && (
          <div
            className="absolute w-px h-full bg-gray-300"
            style={{ left: widthStats.maxContent - 1 }}
          />
        )}
      </div>
    );
  },
);

export function getWidthStats(elem: HTMLElement): {
  minContent: number;
  maxContent: number;
} {
  const clone = elem.cloneNode(true) as HTMLElement;
  clone.style.position = "absolute";
  clone.style.visibility = "hidden";
  clone.style.width = "min-content";
  document.body.appendChild(clone);
  const minContent = clone.offsetWidth;
  clone.style.width = "max-content";
  const maxContent = clone.offsetWidth;
  clone.remove();
  return { minContent, maxContent };
}
