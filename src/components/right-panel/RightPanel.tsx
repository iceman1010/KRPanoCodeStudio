import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/appStore";
import { PromptBox } from "@/components/right-panel/PromptBox";
import { FilesSummary } from "@/components/right-panel/FilesSummary";
import { ActivityLog } from "@/components/right-panel/ActivityLog";
import { DiffViewer } from "@/components/right-panel/DiffViewer";
import { ClarifyChat } from "@/components/right-panel/ClarifyChat";
import { ActionBar } from "@/components/right-panel/ActionBar";

export function RightPanel() {
  const phase = useAppStore((s) => s.phase);
  const error = useAppStore((s) => s.error);
  const setError = useAppStore((s) => s.setError);

  return (
    <div className="flex h-full flex-col bg-background">
      <PromptBox />
      {phase === "clarify" && <ClarifyChat />}
      {error && phase !== "review" && (
        <div className="flex items-start gap-2 border-b bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        <FilesSummary />
        <ActivityLog />
        <DiffViewer />
      </div>
      <ActionBar />
    </div>
  );
}
