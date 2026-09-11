import { AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {onRetry && (
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
