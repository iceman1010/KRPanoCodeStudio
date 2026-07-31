import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { invoke, isElectron } from "@/lib/electron";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const showReasoning = useAppStore((s) => s.showReasoning);
  const setShowReasoning = useAppStore((s) => s.setShowReasoning);
  const models = useAppStore((s) => s.models);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setModels = useAppStore((s) => s.setModels);

  const [apiKey, setApiKey] = useState("");
  const [backupKeep, setBackupKeep] = useState(10);
  const [verifying, setVerifying] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  // Try to load models on first open (if a tour is loaded).
  useEffect(() => {
    if (!open) return;
    if (!isElectron()) return;
    setLoadingModels(true);
    invoke<string[]>("list_models")
      .then((m) => {
        setModels(m);
        if (m.length > 0 && !selectedModel) setSelectedModel(m[0]);
      })
      .catch(() => {
        // ignore — settings can still work without models
      })
      .finally(() => setLoadingModels(false));
  }, [open, setModels, selectedModel, setSelectedModel]);

  async function verifyKey() {
    if (!apiKey) return;
    if (!selectedModel) {
      toast.error("Pick a model first");
      return;
    }
    setVerifying(true);
    try {
      const ok = await invoke<boolean>("setup", apiKey, selectedModel);
      if (ok) toast.success("API key verified");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure API access, default model, and UI preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* API key */}
          <div className="space-y-1.5">
            <Label htmlFor="apikey">API key</Label>
            <div className="flex gap-2">
              <Input
                id="apikey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="PANOMATICS_API_KEY"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={verifyKey}
                disabled={verifying || !apiKey}
              >
                {verifying ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                )}
                Verify
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Stored in <code className="rounded bg-muted px-1">~/.krpanocode/.env</code> by the PHAR.
            </p>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label>Default model</Label>
            <Select
              value={selectedModel ?? ""}
              onValueChange={setSelectedModel}
              disabled={loadingModels || models.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingModels ? "Loading…" : "Pick a model"} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Backup retention */}
          <div className="space-y-1.5">
            <Label htmlFor="backup">Backup retention</Label>
            <div className="flex items-center gap-2">
              <Input
                id="backup"
                type="number"
                min={1}
                max={100}
                value={backupKeep}
                onChange={(e) => setBackupKeep(Number(e.target.value) || 10)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">
                backups kept per tour (managed by PHAR)
              </span>
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show reasoning */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="reasoning"
              checked={showReasoning}
              onCheckedChange={(v) => setShowReasoning(v === true)}
            />
            <Label htmlFor="reasoning" className="cursor-pointer text-sm font-normal">
              Show AI reasoning in activity log
            </Label>
          </div>

          {/* Version */}
          <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
            <span>
              KRpanoCode Studio <Badge variant="outline" className="ml-1">v0.1.0</Badge>
            </span>
            <Button variant="ghost" size="sm" disabled>
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Check for updates
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
