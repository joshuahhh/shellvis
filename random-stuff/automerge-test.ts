import * as A from '@automerge/automerge';
import util from 'util';

function inspect(value: any) {
  return util.inspect(value, { showHidden: false, depth: null, colors: true })
}

console.log(">>>>>>>>>>>>>>>>");

const doc1 = A.from({points: [{x: 1, y: 10, extra: {}}, {x: 2, y: 20, extra: {}}]})

const doc2 = A.change(doc1, doc1 => {
  doc1.points[0].y = 100;
});

console.log("doc1 === doc2", doc1 === doc2);
console.log("doc1.points[0] === doc2.points[0]", doc1.points[0] === doc2.points[0]);
console.log("doc1.points[0].extra === doc2.points[0].extra", doc1.points[0].extra === doc2.points[0].extra);
console.log("doc1.points[1] === doc2.points[1]", doc1.points[1] === doc2.points[1]);

// const doc3 = A.change(doc1, doc1 => {
//   const newPt = {...doc1.points[0], y: 1000};
//   const newPoints = [...doc1.points];
//   newPoints[0] = newPt;
//   doc1.points = newPoints;
// });

console.log("<<<<<<<<<<<<<<<<\n\n\n");
