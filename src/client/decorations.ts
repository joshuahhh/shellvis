import { rangeIncl } from '../shared/util.js';

export type Decoration = {
  start: number,
  end: number,
  decorator: (contents: React.ReactNode) => React.ReactNode,
};

export function addDecorationsToLineStarter(line: string) {
  let nodes: React.ReactNode[] = Array.from(line);
  let starts: number[] = rangeIncl(0, line.length - 1);
  let ends: number[] = rangeIncl(1, line.length);
  return [nodes, starts, ends] as const;
}

// this mutates nodes/starts/ends
export function addDecorationsToLineHelper(nodes: React.ReactNode[], starts: number[], ends: number[], decorations: Decoration[]) {
  // apply smaller decorations first
  decorations.sort((a, b) => (a.end - a.start) - (b.end - a.start));

  for (const decoration of decorations) {
    // find a node with start = decoration.start
    const i = starts.indexOf(decoration.start);
    if (i === -1) {
      throw new Error('decoration starts in the middle of a node');
    }

    // find a node with end = decoration.end
    const j = ends.indexOf(decoration.end);
    if (j === -1) {
      throw new Error('decoration ends in the middle of a node');
    }

    // replace range of nodes with decorated version
    nodes.splice(i, j - i + 1, decoration.decorator(nodes.slice(i, j + 1)));

    // update starts and ends
    starts.splice(i + 1, j - i);
    ends.splice(i, j - i);
  }
}

export function addDecorationsToLine(line: string, decorations: Decoration[]): React.ReactNode {
  const [nodes, starts, ends] = addDecorationsToLineStarter(line);
  addDecorationsToLineHelper(nodes, starts, ends, decorations);
  return nodes;
}

// example use / test:

// {addDecorationsToLine("hello world", [
//   {
//     start: 0,
//     end: 5,
//     decorator: (contents) => <span style={{color: "red"}}>{contents}</span>
//   },
//   {
//     start: 6,
//     end: 11,
//     decorator: (contents) => <span style={{textDecoration: "underline"}}>{contents}</span>
//   },
//   {
//     start: 7,
//     end: 8,
//     decorator: (contents) => <span style={{fontSize: '200%'}}>{contents}</span>
//   }
// ])}
