import { memo } from 'react';
import { twMerge } from 'tailwind-merge';

export const GridTest = memo(() => {
  const widths = [200, 400, 600, 800];

  return <div className='px-16 mt-4'>
   <h1 className='text-4xl mb-6 text-gray-300'>grid test</h1>
   <p>ok this is wip ok</p>
   {widths.map((width, i) =>
      <div key={i} style={{width, maxWidth: width}}>
        <div className='inline-grid grid-cols-[fit-content(0%)_minmax(0,max-content)_minmax(min-content,max-content)_1fr]'>
          <TrackLabels numTracks={4}/>
          <TestBlock width={40} className='bg-blue-500'/>
          <TestBlock width={400} minWidth={0} className='bg-orange-500'/>
          <TestBlock width={200} minWidth={0} className='bg-indigo-500 col-span-2'/>
        </div>
      </div>
    )}
  </div>;
});

const TrackLabels = memo((props: {
  numTracks: number,
}) => {
  const { numTracks } = props;
  return Array.from({ length: numTracks }).map((_, i) => {
    return <div key={i} className='text-gray-300 text-sm text-center border-r-2'>
      {i}
    </div>;
  });
});

const TestBlock = memo((props: {
  width: number,
  minWidth?: number,
  className?: string,
}) => {
  const { width, minWidth = width, className } = props;
  const extra = width - minWidth;
  return <div className={twMerge('h-6 rounded flex bg-slate-500', className)} style={{ width, minWidth }}>
    { minWidth > 0 &&
      <div className='px-1 border-r-2' style={{ width: minWidth }}>
        {minWidth}
      </div>
    }
    { extra > 0 &&
      <div className='px-1 flex-grow'>
        {width - minWidth}
      </div>
    }
  </div>;
});
