import { SortsFlowLine } from "@/components/sorts/flow-line";
import { LoadingState } from "@/components/ui/misc";

export default function AppLoading() {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[var(--z-toast)]">
        <SortsFlowLine label="Loading page" thickness={2} className="rounded-none bg-transparent" />
      </div>
      <LoadingState variant="page" message="Loading page" />
    </>
  );
}
