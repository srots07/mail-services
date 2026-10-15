import { SortsFlowLine } from "./flow-line";
import { SortsMark } from "./logo";

/** Initialisation screen: the mark rises into place above a flow line and a status message. */
export function SortsBoot({ message = "Loading your workspace", className }: { message?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className ?? "flex min-h-[50vh] flex-col items-center justify-center gap-5"}>
      <SortsMark size={44} className="boot-mark" priority />
      <div className="w-40">
        <SortsFlowLine label={message} thickness={2} />
      </div>
      <p className="type-caption text-muted">{message}</p>
    </div>
  );
}
