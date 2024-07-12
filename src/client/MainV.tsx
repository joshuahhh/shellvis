import { library } from '@fortawesome/fontawesome-svg-core';
import { faEllipsisVertical, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { memo } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { ASTTest } from './ASTTest.js';
import { GridTest } from './GridTest.js';
import { Body } from './Body.js';
import { CliSessionV } from './SessionV.js';
import { HighlightingTest } from './HighlightingTest.js';
import { TestbedLinksV, TestbedV } from './TestbedV.js';
import './style.css';

library.add(faRotateRight, faRotateLeft, faEllipsisVertical);

export const MainV = memo(() => {
  return <>
    <HashRouter>
      <Routes>
        <Route path='/cli' element={<CliSessionV/>}/>
        <Route path='/testbed/:name' element={<TestbedV/>}/>
        <Route path='/highlighting-test' element={<HighlightingTest/>}/>
        <Route path='/ast-test' element={<ASTTest/>}/>
        <Route path='/grid-test' element={<GridTest/>}/>
        <Route path='*' element={<HomeV/>}/>
      </Routes>
    </HashRouter>
    <Body className='bg-[#1F1F1F] text-white leading-5 font-sans overflow-x-hidden w-full h-full'/>
  </>;
});

const HomeV = memo(() => {
  return <div className='px-16 mt-4 prose dark:prose-invert prose-a:text-blue-400 hover:prose-a:text-blue-500'>
    <ul>
      <li>
        <Link to='/cli'>cli</Link>
      </li>
      <li>
        testbed
        <TestbedLinksV/>
      </li>
      <li>
        tests
        <ul>
          <li><Link to='/highlighting-test'>highlighting test</Link></li>
          <li><Link to='/ast-test'>ast test</Link></li>
          <li><Link to='/grid-test'>grid test</Link></li>
        </ul>
      </li>
    </ul>
  </div>;
});
