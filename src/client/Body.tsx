import { memo, useEffect } from 'react';


// TODO: Limitation here is that classes on <body> can only come from this component.
//   (or at least they can't overlap)

let classCounts: Record<string, number> = {};
function syncClassCounts() {
  const body = document.body;
  for (const className in classCounts) {
    if (classCounts[className] === 0) {
      body.classList.remove(className);
    } else {
      body.classList.add(className);
    }
  }
}

export const Body = memo((props: {
  className?: string,
}) => {
  const { className } = props;

  useEffect(() => {
    if (className) {
      const classNames = className.split(' ').filter(Boolean);
      for (const className of classNames) {
        classCounts[className] = (classCounts[className] || 0) + 1;
      }
      syncClassCounts();
      return () => {
        for (const className of classNames) {
          classCounts[className] = (classCounts[className] || 0) - 1;
        }
        syncClassCounts();
      };
    }
  }, [className]);

  return null;
});
