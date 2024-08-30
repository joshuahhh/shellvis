import { library } from "@fortawesome/fontawesome-svg-core";
import {
  faEllipsisVertical,
  faRotateLeft,
  faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import { memo } from "react";
import { HashRouter, Link, Route, Routes } from "react-router-dom";
import { ASTTest } from "./ASTTest.js";
import { useBodyClass } from "./Body.js";
import { GalleryOfAnnotations } from "./GalleryOfAnnotations.js";
import { GridTest } from "./GridTest.js";
import { HighlightingTest } from "./HighlightingTest.js";
import { CliSessionV } from "./SessionV.js";
import { TestbedLinksV, TestbedV } from "./TestbedV.js";
import { darkBodyClass } from "./darkBodyClass.js";
import "./style.css";

library.add(faRotateRight, faRotateLeft, faEllipsisVertical);

export const MainV = memo(() => {
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/cli" element={<CliSessionV />} />
          <Route path="/testbed/:name" element={<TestbedV />} />
          <Route
            path="/gallery-of-annotations"
            element={<GalleryOfAnnotations />}
          />
          <Route path="/highlighting-test" element={<HighlightingTest />} />
          <Route path="/ast-test" element={<ASTTest />} />
          <Route path="/grid-test" element={<GridTest />} />
          <Route path="*" element={<HomeV />} />
        </Routes>
      </HashRouter>
    </>
  );
});

const HomeV = memo(() => {
  useBodyClass(darkBodyClass);

  return (
    <div className="px-16 mt-16 prose dark:prose-invert prose-a:text-blue-400 hover:prose-a:text-blue-500">
      <h1>ShellVis</h1>
      <h2>study</h2>
      <TestbedLinksV studyOnly />
      <details className="absolute bottom-8 open:static">
        <summary>other</summary>
        <ul>
          <li>
            <Link to="/cli">cli</Link>
          </li>
          <li>
            testbed
            <TestbedLinksV />
          </li>
          <li>
            <Link to="/gallery-of-annotations">gallery of annotations</Link>
          </li>
          <li>
            tests
            <ul>
              <li>
                <Link to="/highlighting-test">highlighting test</Link>
              </li>
              <li>
                <Link to="/ast-test">ast test</Link>
              </li>
              <li>
                <Link to="/grid-test">grid test</Link>
              </li>
            </ul>
          </li>
        </ul>
      </details>
    </div>
  );
});
