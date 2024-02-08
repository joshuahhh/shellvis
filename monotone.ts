
function pointInInterval(x: number, interval: { center: number, width: number }): boolean {
  return x >= interval.center - interval.width / 2 && x <= interval.center + interval.width / 2;
}

function intervalsOverlap(a: { center: number, width: number }, b: { center: number, width: number }): boolean {
  return Math.abs(a.center - b.center) < (a.width + b.width) / 2;
}

function mapObject<T, U>(obj: Record<string, T>, fn: (value: T, key: string) => U): Record<string, U> {
  const result: Record<string, U> = {};
  for (const key in obj) {
    result[key] = fn(obj[key], key);
  }
  return result;
}

type Block = {
  width: number,
  center: number,
  weight: number,
  intervalCenters: Record<string, number>,
}

type Interval = {
  id: string,
  width: number,
  centerTarget: number,
  weight?: number,
}

function layOutIntervals(
  intervals: Interval[]
): Record<string, number> {
  const blocks: Block[] = [];

  intervals.sort((a, b) => a.centerTarget - b.centerTarget);

  for (const interval of intervals) {
    let rightBlock: Block = {
      width: interval.width,
      center: interval.centerTarget,
      weight: interval.weight || 1,
      intervalCenters: {[interval.id]: interval.centerTarget},  // from center of block to center of interval
    }
    while (true) {
      const leftBlock: Block | undefined = blocks[blocks.length - 1];
      if (!leftBlock || !intervalsOverlap(leftBlock, rightBlock)) {
        // no overlap
        console.log(`pushing ${blocks.length}`)
        blocks.push(rightBlock);
        break;
      }
      // overlap; join into newBlock
      console.log(`merging ${blocks.length} and ${blocks.length - 1}`);
      const newWeight = leftBlock.weight + rightBlock.weight;
      const leftCoeff = leftBlock.weight / newWeight;
      const rightCoeff = rightBlock.weight / newWeight;
      // TODO: not right
      const newCenter = leftCoeff * leftBlock.center + rightCoeff * rightBlock.center;
      const newWidth = leftBlock.width + rightBlock.width;
      const newLeftCenter = newCenter - newWidth / 2 + leftBlock.width / 2;
      const newRightCenter = newCenter + newWidth / 2 - rightBlock.width / 2;
      rightBlock = {
        width: newWidth,
        center: newCenter,
        weight: newWeight,
        intervalCenters: {
          ...mapObject(leftBlock.intervalCenters, center => center - leftBlock.center + newLeftCenter),
          ...mapObject(rightBlock.intervalCenters, center => center - rightBlock.center + newRightCenter),
        }
      };
      blocks.pop();
    }
  }

  let result: Record<string, number> = {};
  for (const block of blocks) {
    result = {...result, ...block.intervalCenters};
  }
  return result;
}

function validateLayOut(intervals: Interval[], centers: Record<string, number>) {
  intervals.sort((a, b) => a.centerTarget - b.centerTarget);

  const intervalsWithCenters = intervals.map(interval => ({...interval, center: centers[interval.id]}));

  for (let i = 0; i < intervals.length - 1; i++) {
    if (intervalsOverlap(intervalsWithCenters[i], intervalsWithCenters[i + 1])) {
      throw new Error(`overlap ${i}`);
    }
  }
}

function testIntervals(intervals: Interval[]) {
  const centers = layOutIntervals(intervals);
  console.log(centers);
  validateLayOut(intervals, centers);
}

testIntervals([
  {id: 'a', width: 1, centerTarget: 0},
  {id: 'b', width: 1, centerTarget: 1},
  {id: 'c', width: 1, centerTarget: 2},
]);

testIntervals([
  {id: 'a', width: 2, centerTarget: 0},
  {id: 'b', width: 2, centerTarget: 1},
]);

testIntervals([
  {id: 'a', width: 4, centerTarget: 0},
  {id: 'b', width: 4, centerTarget: 1},
]);

testIntervals([
  {id: 'a', width: 4, centerTarget: 0, weight: 10000},
  {id: 'b', width: 4, centerTarget: 1},
]);
