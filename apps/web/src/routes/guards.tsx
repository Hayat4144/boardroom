import { Navigate, Outlet, useLocation } from "react-router";
import { ErrorState } from "@/components/states";
import { BrandMark } from "@/components/brand";
import { useMe } from "@/hooks/queries";

function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <BrandMark className="size-9 animate-pulse" />
    </div>
  );
}

/** Signed-in users only; others go to /login and come back afterwards. */
export function RequireAuth() {
  const { data: me, isPending, error, refetch } = useMe();
  const location = useLocation();
  if (isPending) return <FullPageLoader />;
  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

export function RequireAdmin() {
  const { data: me } = useMe();
  if (me?.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Signed-in users skip /login and /signup. */
export function RedirectIfAuthed() {
  const { data: me, isPending } = useMe();
  if (isPending) return <FullPageLoader />;
  if (me) return <Navigate to="/" replace />;
  return <Outlet />;
}
