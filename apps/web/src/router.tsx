import { createBrowserRouter, Navigate } from 'react-router-dom'

import { App } from './App'
import { DatasetUploadPage } from './features/datasets/DatasetUploadPage'
import { FieldMappingPage } from './features/datasets/FieldMappingPage'
import { TemplateEditorPage } from './features/templates/TemplateEditorPage'
import { TemplateListPage } from './features/templates/TemplateListPage'
import { TemplatePreviewPage } from './features/templates/TemplatePreviewPage'
import { AnalysisRequestPage } from './features/analysis/AnalysisRequestPage'
import { PlanConfirmationPage } from './features/analysis/PlanConfirmationPage'
import { TaskDetailPage } from './features/tasks/TaskDetailPage'
import { ReportEditorPage } from './features/reports/ReportEditorPage'
import { ReportViewPage } from './features/reports/ReportViewPage'
import { ScriptUploadPage } from './features/scripts/ScriptUploadPage'
import { AssetListPage } from './features/assets/AssetListPage'
import { AssetDetailPage } from './features/assets/AssetDetailPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/assets" replace /> },
      { path: 'assets', element: <AssetListPage /> },
      { path: 'assets/:assetId', element: <AssetDetailPage /> },
      { path: 'templates', element: <TemplateListPage /> },
      { path: 'templates/new', element: <TemplateEditorPage /> },
      { path: 'templates/:templateId/edit', element: <TemplateEditorPage /> },
      { path: 'templates/:templateId', element: <TemplatePreviewPage /> },
      { path: 'datasets/new', element: <DatasetUploadPage /> },
      { path: 'datasets/:versionId/mapping', element: <FieldMappingPage /> },
      { path: 'datasets/:versionId/analysis', element: <AnalysisRequestPage /> },
      { path: 'plans/:planId', element: <PlanConfirmationPage /> },
      { path: 'tasks/:taskId', element: <TaskDetailPage /> },
      { path: 'tasks/:taskId/reports/new', element: <ReportEditorPage /> },
      { path: 'reports/:reportVersionId', element: <ReportViewPage /> },
      { path: 'internal/scripts', element: <ScriptUploadPage /> },
    ],
  },
])
