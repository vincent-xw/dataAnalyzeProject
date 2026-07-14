import { createBrowserRouter, Navigate } from 'react-router-dom'

import { App } from './App'
import { DatasetUploadPage } from './features/datasets/DatasetUploadPage'
import { FieldMappingPage } from './features/datasets/FieldMappingPage'
import { TemplateEditorPage } from './features/templates/TemplateEditorPage'
import { TemplateListPage } from './features/templates/TemplateListPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/templates" replace /> },
      { path: 'templates', element: <TemplateListPage /> },
      { path: 'templates/new', element: <TemplateEditorPage /> },
      { path: 'datasets/new', element: <DatasetUploadPage /> },
      { path: 'datasets/:versionId/mapping', element: <FieldMappingPage /> },
    ],
  },
])
