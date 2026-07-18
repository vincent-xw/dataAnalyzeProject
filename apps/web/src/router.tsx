import { createBrowserRouter, Navigate } from 'react-router-dom'

import { App } from './App'
import { AssetListPage } from './features/assets/AssetListPage'
import { AssetDetailPage } from './features/assets/AssetDetailPage'
import { AssetUploadPage } from './features/assets/AssetUploadPage'
import { AnalysisListPage } from './features/analyses/AnalysisListPage'
import { AnalysisDetailPage } from './features/analyses/AnalysisDetailPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/assets" replace /> },
      { path: 'assets', element: <AssetListPage /> },
      { path: 'assets/upload', element: <AssetUploadPage /> },
      { path: 'assets/:assetId', element: <AssetDetailPage /> },
      { path: 'analyses', element: <AnalysisListPage /> },
      { path: 'analyses/:analysisId', element: <AnalysisDetailPage /> },
    ],
  },
])
