import { library } from '@fortawesome/fontawesome-svg-core'
import { faEllipsisVertical, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import React, { memo } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from "react-router-dom"
import { CliV } from './CliV.js'
import { TestbedLinksV, TestbedV } from './TestbedV.js'

import "./style.css"
import { HighlightingTest } from './HighlightingTest.js'
import { ASTTest } from './ASTTest.js'

library.add(faRotateRight, faRotateLeft, faEllipsisVertical)

if (import.meta.hot) {
  console.log("hot reloading enabled");
  import.meta.hot.accept();
}

const HomeV = memo(() => {
  return <div className='prose dark:prose-invert prose-a:text-blue-400 hover:prose-a:text-blue-500'>
    <ul>
      <li>
        <Link to="/cli">cli</Link>
      </li>
      <li>
        testbed
        <TestbedLinksV/>
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
        </ul>
      </li>
    </ul>
  </div>
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/cli" element={<CliV/>}/>
        <Route path="/testbed/:name" element={<TestbedV/>}/>
        <Route path="/highlighting-test" element={<HighlightingTest/>}/>
        <Route path="/ast-test" element={<ASTTest/>}/>
        <Route path="*" element={<HomeV/>}/>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
