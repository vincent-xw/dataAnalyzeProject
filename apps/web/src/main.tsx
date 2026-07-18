import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from './router'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('ROOT_ELEMENT_NOT_FOUND')
}

createRoot(rootElement).render(
  <RouterProvider router={router} />,
)
