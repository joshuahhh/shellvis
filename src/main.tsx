import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.js'
import { library } from '@fortawesome/fontawesome-svg-core'
import { faRotateRight, faRotateLeft, faEllipsisVertical } from '@fortawesome/free-solid-svg-icons'

library.add(faRotateRight, faRotateLeft, faEllipsisVertical)

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>
)
