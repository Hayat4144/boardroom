import { createBrowserRouter } from "react-router";
import { AppShell } from "@/components/app-shell";
import { LlmCallsPage } from "@/routes/admin/llm-calls";
import { LoginPage, SignupPage } from "@/routes/auth";
import { CompanyPage } from "@/routes/company/company-page";
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from "@/routes/guards";
import { NotFoundPage } from "@/routes/not-found";
import { WatchlistPage } from "@/routes/watchlist";

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <WatchlistPage /> },
          { path: "/companies/:id", element: <CompanyPage /> },
          {
            element: <RequireAdmin />,
            children: [{ path: "/admin/llm-calls", element: <LlmCallsPage /> }],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
