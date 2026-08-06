import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Book, BookOpen, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { marked } from "marked";

// Mirror of mkdocs.yml `nav`. Single source of truth for the sidebar order.
const PAGES = [
  { slug: "index", label: "Home" },
  { slug: "getting-started", label: "Getting started" },
  { slug: "the-interface", label: "The interface" },
  { slug: "editing-tours", label: "Editing tours" },
  { slug: "clarify", label: "Clarify mode" },
  { slug: "what-happens-inside", label: "What happens inside" },
  { slug: "settings", label: "Settings" },
  { slug: "troubleshooting", label: "Troubleshooting" },
  { slug: "faq", label: "FAQ" },
] as const;

// Vite bundles all .md files in manual/ as raw strings at build time.
// In dev the same glob is resolved by vite; in packaged there's no
// runtime file access — the content is baked into the bundle.
const markdownFiles = import.meta.glob<string>("/manual/*.md", { query: "?raw", import: "default", eager: true });

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function renderHtml(raw: string): string {
  let html = marked.parse(raw, { async: false }) as string;
  // Add target="_blank" to all external links since we're in a sandboxed
  // webview. DOMPurify already strips dangerous content.
  html = html.replace(
    /<a /g,
    '<a target="_blank" rel="noopener noreferrer" ',
  );
  return DOMPurify.sanitize(html);
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const [activeSlug, setActiveSlug] = useState("index");
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState("");

  const raw = useMemo(() => {
    const key = `/manual/${activeSlug}.md`;
    return markdownFiles[key] ?? "# Page not found\n\nThis page doesn't exist in the manual. Check the navigation.";
  }, [activeSlug]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timeout = setTimeout(() => {
      const rendered = renderHtml(raw);
      setHtml(rendered);
      setLoading(false);
    }, 16); // tiny defer so the Dialog transition isn't blocked
    return () => {
      clearTimeout(timeout);
      setLoading(false);
    };
  }, [open, raw]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-[90vw] md:max-w-[90vw] max-h-[90vh] p-0">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
              <span className="font-heading text-base font-medium">
                KRpanoCode Studio Manual
              </span>
            </div>
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          {/* sidebar */}
          <nav className="w-48 flex-shrink-0 border-r bg-muted/30 py-2">
            <ScrollArea className="h-full">
              <ul className="space-y-1 px-2">
                {PAGES.map((p) => {
                  const active = p.slug === activeSlug;
                  return (
                    <li key={p.slug}>
                      <button
                        type="button"
                        onClick={() => setActiveSlug(p.slug)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs transition-colors",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                        )}
                      >
                        {active ? (
                          <BookOpen className="h-3 w-3" />
                        ) : (
                          <Book className="h-3 w-3" />
                        )}
                        {p.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </nav>

          {/* content */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <ScrollArea className="h-[calc(90vh-72px)]">
              <div className="px-6 py-5">
                {loading ? (
                  <div className="flex items-center gap-3 py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : (
                  <div
                    className="prose prose-sm dark:prose-invert prose-headings:scroll-m-20 prose-a:text-primary prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-pre:bg-muted prose-pre:text-xs prose-table:text-xs max-w-none [&_table]:w-full [&_table_th]:text-left [&_table_th]:px-2 [&_table_th]:py-1.5 [&_table_td]:px-2 [&_table_td]:py-1.5 [&_table_td]:border-t [&_table_th]:border-b [&_blockquote]:text-xs [&_blockquote]:text-muted-foreground [&_blockquote]:border-l-muted-foreground/30 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm [&_hr]:border-muted/50"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}