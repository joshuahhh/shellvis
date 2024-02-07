import React, { memo } from 'react'
import ReactDOM from 'react-dom/client'
import { CliV } from './CliV.js'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faRotateRight, faRotateLeft, faEllipsisVertical } from '@fortawesome/free-solid-svg-icons'
import { HashRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import styleCss from "./style.css?inline";

library.add(faRotateRight, faRotateLeft, faEllipsisVertical)

const HomeV = memo(() => {
  return <>
    <ul>
      <li>
        <Link to="/cli">cli</Link>
      </li>
      <li>
      <Link to="/testbed">testbed</Link>
      </li>
    </ul>
  </>
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <style dangerouslySetInnerHTML={{ __html: styleCss }} />
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomeV/>}/>
        <Route path="/cli" element={<CliV/>}/>
        {/* <Route path="/testbed" element={<Testbed/>}/> */}
        <Route path="*" element={<>no dice buddy</>}/>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
