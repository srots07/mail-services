"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/misc";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const dbIssue = /database|DATABASE_URL|connect/i.test(error.message);
  const details = [error.digest && `Reference ${error.digest}`, process.env.NODE_ENV !== "production" && error.message].filter(Boolean).join("\n");
  return (
    <ErrorState
      className="mx-auto mt-10 max-w-lg"
      title={dbIssue ? "Sorts can't reach its database" : "Sorts couldn't load this page"}
      description={
        dbIssue
          ? "Check that the database is running and DATABASE_URL is set on the server, then try again."
          : "The server returned an unexpected error. Your campaigns and contacts are safe. Try again, or go back to the dashboard."
      }
      details={details || null}
      action={
        <>
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
        </>
      }
    />
  );
}
