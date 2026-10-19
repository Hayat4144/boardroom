import { Compass } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      description="That page doesn't exist or has moved."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/">Back to watchlist</Link>
        </Button>
      }
    />
  );
}
