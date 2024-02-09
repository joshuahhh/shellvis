export function monotonicRegression(ys: number[], weights?: number[]): number[] {
  if (weights !== undefined && weights.length !== ys.length) {
    throw new Error('weights (if provided) must have the same length as ys');
  }

  type Block = {
    right: number,
    y: number,
    weight: number,
  };
  const blocks: Block[] = [];

  for (let i = 0; i < ys.length; i++) {
    let newBlock: Block = {
      right: i,
      y: ys[i],
      weight: weights ? weights[i] : 1,
    };
    while (true) {
      const lastBlock = blocks[blocks.length - 1];
      if (!lastBlock || lastBlock.y <= newBlock.y) {
        break;
      }
      blocks.pop();  // remove lastBlock
      newBlock = {
        right: newBlock.right,
        y: (lastBlock.weight * lastBlock.y + newBlock.weight * newBlock.y)
           / (lastBlock.weight + newBlock.weight),
        weight: newBlock.weight + lastBlock.weight,
      };
    }
    blocks.push(newBlock);
  }

  let result: number[] = [];
  let activeBlockIdx = 0;
  for (let i = 0; i < ys.length; i++) {
    while (blocks[activeBlockIdx].right < i) {
      activeBlockIdx++;
    }
    result.push(blocks[activeBlockIdx].y);
  }
  return result;
}


export type Interval = {
  id: string,
  width: number,
  leftTarget: number,
  weight?: number,
}

export function layOutIntervals(
  intervals: Interval[]
): Record<string, number> {
  // sort by center
  intervals.sort((a, b) => (a.leftTarget + a.width / 2) - (b.leftTarget + b.width / 2));

  // offsets (to turn this into monotonic regression) are partial sums of widths
  const offsets = [0];
  let offset = 0;
  for (let i = 0; i < intervals.length - 1; i++) {
    offset += intervals[i].width;
    offsets.push(offset);
  }

  const ys = intervals.map((interval, i) => interval.leftTarget - offsets[i]);
  const weights = intervals.map(interval => interval.weight || 1);
  const ysMonotone = monotonicRegression(ys, weights);

  const result: Record<string, number> = {};
  for (let i = 0; i < intervals.length; i++) {
    result[intervals[i].id] = ysMonotone[i] + offsets[i];
  }
  return result;
}
