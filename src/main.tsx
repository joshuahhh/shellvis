import { library } from '@fortawesome/fontawesome-svg-core'
import { faEllipsisVertical, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import React, { memo } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Link, Route, Routes } from "react-router-dom"
import { CliV } from './CliV.js'
import styleCss from "./style.css?inline"
import { TestbedLinksV, TestbedV } from './TestbedV.js'

library.add(faRotateRight, faRotateLeft, faEllipsisVertical)

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
    </ul>
  </>
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <style dangerouslySetInnerHTML={{ __html: styleCss }} />
    <HashRouter>
      <Routes>
        <Route path="/cli" element={<CliV/>}/>
        <Route path="/testbed/:name" element={<TestbedV/>}/>
        <Route path="*" element={<HomeV/>}/>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
