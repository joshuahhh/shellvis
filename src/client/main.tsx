import { library } from '@fortawesome/fontawesome-svg-core'
import { faEllipsisVertical, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import React, { memo } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from "react-router-dom"
import { CliV } from './CliV.js'
import { TestbedLinksV, TestbedV } from './TestbedV.js'

import "./style.css"
import { HighlightingTest } from './HighlightingTest.js'

library.add(faRotateRight, faRotateLeft, faEllipsisVertical)

if (import.meta.hot) {
  console.log("hot reloading enabled");
  import.meta.hot.accept();
}

const HomeV = memo(() => {
  return <>
    <ul>
      <li>
        <Link to="/cli">cli</Link>
      </li>
      <li>
        testbed
        <TestbedLinksV/>
      </li>
      <li>
        <Link to="/highlighting-test">highlighting test</Link>
      </li>
    </ul>
  </>
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/cli" element={<CliV/>}/>
        <Route path="/testbed/:name" element={<TestbedV/>}/>
        <Route path="/highlighting-test" element={<HighlightingTest/>}/>
        <Route path="*" element={<HomeV/>}/>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
