import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import AuthLayout from "@/layouts/AuthLayout";
import MainLayout from "@/layouts/MainLayout";
import { transactionsRoutes } from "./transactions.routes";
import { AuthProvider } from "@/components/common/AuthContext";
import ProtectedRoute from "@/components/common/ProtectedRoute";
import RouteErrorBoundary from "@/components/common/RouteErrorBoundary";

const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const SignUpPage = lazy(() => import("@/pages/auth/SignUpPage"));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const PortfolioPage = lazy(() => import("@/pages/portfolio/PortfolioPage"));
const PortfolioAnalysisPage = lazy(() => import("@/pages/portfolio/PortfolioAnalysisPage"));
const ImportPage = lazy(() => import("@/pages/import-data/ImportPage"));
const NetWorthPage = lazy(() => import("@/pages/net-worth/NetWorthPage"));
const SalaryPage = lazy(() => import("@/pages/salary/SalaryPage"));
const SalaryHistoryPage = lazy(() => import("@/pages/salary/SalaryHistoryPage"));
const ReportsPage = lazy(() => import("@/pages/reports/ReportsPage"));
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage"));
const AccountSettingsPage = lazy(() => import("@/pages/settings/AccountSettingsPage"));
const SupportPage = lazy(() => import("@/pages/support/SupportPage"));
const TaxesPage = lazy(() => import("@/pages/taxes/TaxesPage"));
const DebtsPage = lazy(() => import("@/pages/debts/DebtsPage"));
const DebtDetailPage = lazy(() => import("@/pages/debts/DebtDetailPage"));
const BankingPage = lazy(() => import("@/pages/banking/BankingPage"));
const BankingHistoryPage = lazy(() => import("@/pages/banking/BankingHistoryPage"));

const deferred = (page: ReactNode) => <Suspense fallback={null}>{page}</Suspense>;

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            path: "/login",
            element: deferred(<LoginPage />),
          },
          {
            path: "/register",
            element: deferred(<SignUpPage />),
          },
        ],
      },
      {
        path: "/",
        element: <ProtectedRoute />,
        children: [
          {
            element: <MainLayout />,
            children: [
              {
                path: "",
                element: deferred(<DashboardPage />),
              },
              {
                path: "networth",
                element: deferred(<NetWorthPage />),
              },
              {
                path: "import",
                element: deferred(<ImportPage />),
              },
              {
                path: "banking",
                element: deferred(<BankingPage />),
              },
              {
                path: "banking/history",
                element: deferred(<BankingHistoryPage />),
              },
              {
                path: "salary",
                children: [
                  { path: "", element: deferred(<SalaryPage />) },
                  { path: "history", element: deferred(<SalaryHistoryPage />) },
                ],
              },
              {
                path: "taxes",
                element: deferred(<TaxesPage />),
              },
              {
                path: "debts",
                children: [
                  { path: "", element: deferred(<DebtsPage />) },
                  { path: ":id", element: deferred(<DebtDetailPage />) },
                ],
              },
              {
                path: "reports",
                element: deferred(<ReportsPage />),
              },
              {
                path: "projects",
                element: deferred(<ProjectsPage />),
              },
              {
                path: "settings",
                element: deferred(<AccountSettingsPage />),
              },
              {
                path: "support",
                element: deferred(<SupportPage />),
              },
              ...transactionsRoutes,
              {
                path: "portfolio",
                children: [
                  {
                    path: "",
                    element: deferred(<PortfolioPage />),
                  },
                  {
                    path: ":symbol",
                    element: deferred(<PortfolioAnalysisPage />),
                  }
                ]
              },
            ]
          }
        ],
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ]
  }
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
