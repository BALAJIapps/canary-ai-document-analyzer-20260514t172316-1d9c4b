'use client';

import { useState } from 'react';
import { FileText, Search, History, Sparkles, Loader2, ChevronRight, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Document {
  id: string;
  title: string;
  source_name: string | null;
  created_at: string;
}

interface Analysis {
  id: string;
  document_id: string;
  summary: string;
  key_points: string[];
  topics: string[];
  model: string;
  created_at: string;
  fallback: boolean;
}

interface SearchResult {
  id: string;
  title: string;
  source_name: string | null;
  summary: string | null;
  key_points: unknown;
  topics: unknown;
  similarity: number;
  created_at: string;
}

export default function Home() {
  const [docTitle, setDocTitle] = useState('');
  const [docSource, setDocSource] = useState('');
  const [docText, setDocText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [history, setHistory] = useState<Document[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSubmitDocument(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    setAnalysis(null);
    setAnalyzeError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/canary-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: docTitle, document_text: docText, source_name: docSource || undefined }),
      });
      const data = await res.json();
      if (!data.ok) { setSubmitError(data.error?.message ?? 'Failed to save document'); return; }
      const docId = data.document?.id;
      setAnalyzing(true);
      const analyzeRes = await fetch('/api/canary-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId, document_text: docText }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.ok) { setAnalyzeError(analyzeData.error?.message ?? 'Analysis failed'); }
      else { setAnalysis(analyzeData.analysis); }
      loadHistory();
    } catch { setSubmitError('Network error — please try again'); }
    finally { setSubmitting(false); setAnalyzing(false); }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/canary-documents');
      const data = await res.json();
      if (data.ok) { setHistory(data.documents ?? []); setHistoryLoaded(true); }
    } catch {}
    setHistoryLoading(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchError('');
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch('/api/canary-document-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await res.json();
      if (!data.ok) { setSearchError(data.error?.message ?? 'Search failed'); }
      else { setSearchResults(data.results ?? []); setSearched(true); }
    } catch { setSearchError('Network error — please try again'); }
    finally { setSearching(false); }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#10a37f]" />
            <span className="text-[15px] font-semibold tracking-tight">DocAnalyzer</span>
          </div>
          <span className="rounded-full bg-[#e8f5f0] px-3 py-0.5 text-xs font-medium text-[#0a7a5e]">
            Powered by Gemini
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Hero with distinct serif display font */}
        <div className="mb-10">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#9b9b9b]">AI Document Intelligence</p>
          <h1
            style={{
              fontFamily: '"Source Serif 4", Georgia, "Times New Roman", serif',
              fontWeight: 400,
              fontSize: '2.5rem',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            Extract insights from<br />any document
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Paste in a contract, report, or agreement. Gemini reads it and returns
            a structured summary, key points, and topics — stored for future retrieval.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-[1.6fr_1fr]">
          {/* Left: Document form + analysis result */}
          <div className="space-y-6">
            <Card className="border-border/60 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
                <FileText className="h-4 w-4 text-[#10a37f]" />
                Analyze a document
              </h2>
              <form onSubmit={handleSubmitDocument} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="doc-title">Document title</label>
                  <Input id="doc-title" placeholder="e.g. Vendor Agreement Q3" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="doc-source">Source file <span className="text-muted-foreground/60">(optional)</span></label>
                  <Input id="doc-source" placeholder="e.g. vendor-agreement.pdf" value={docSource} onChange={(e) => setDocSource(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="doc-text">Document text</label>
                  <Textarea id="doc-text" placeholder="Paste the full text of your document here..." value={docText} onChange={(e) => setDocText(e.target.value)} required rows={7} className="resize-none text-sm" />
                </div>
                {submitError && <p className="text-xs text-destructive">{submitError}</p>}
                <Button type="submit" className="w-full bg-[#0d0d0d] text-white hover:bg-[#1a1a1a] active:translate-y-px" disabled={submitting || analyzing}>
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving document...</> : analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing with Gemini...</> : <><Sparkles className="mr-2 h-4 w-4" />Analyze document</>}
                </Button>
              </form>
            </Card>

            {(analysis || analyzeError) && (
              <Card className="border-[#10a37f]/20 bg-[#e8f5f0]/30 p-6">
                <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[#0a7a5e]">
                  <Sparkles className="h-4 w-4" />
                  AI Extraction Result
                </h2>
                {analyzeError && <p className="text-sm text-destructive">{analyzeError}</p>}
                {analysis && (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.06em] text-[#6e6e6e]">Summary</p>
                      <p className="text-sm leading-relaxed">{analysis.summary}</p>
                    </div>
                    {analysis.key_points?.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-[#6e6e6e]">Key points</p>
                        <ul className="space-y-1.5">
                          {analysis.key_points.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10a37f]" />
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.topics?.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-[#6e6e6e]">Topics</p>
                        <div className="flex flex-wrap gap-1.5">
                          {analysis.topics.map((topic, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f5] px-2.5 py-0.5 text-xs font-medium text-[#3c3c3c]">
                              <Tag className="h-2.5 w-2.5" />{topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] text-[#9b9b9b]">Model: {analysis.model}</p>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Right: Search + History */}
          <div className="space-y-6">
            <Card className="border-border/60 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <Search className="h-4 w-4 text-[#10a37f]" />
                Semantic search
              </h2>
              <form onSubmit={handleSearch} className="space-y-3">
                <Input placeholder="Search: insurance, compliance..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="text-sm" />
                <Button type="submit" variant="outline" className="w-full border-[#e5e5e5] text-sm hover:border-[#10a37f] hover:text-[#10a37f] transition-colors" disabled={searching || !searchQuery.trim()}>
                  {searching ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Searching...</> : 'Search documents'}
                </Button>
              </form>
              {searchError && <p className="mt-2 text-xs text-destructive">{searchError}</p>}
              {searched && searchResults.length === 0 && <p className="mt-3 text-xs text-muted-foreground">No matching documents found.</p>}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  {searchResults.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border/50 p-3">
                      <p className="text-sm font-medium leading-tight">{r.title}</p>
                      {r.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-[#9b9b9b]">{new Date(r.created_at).toLocaleDateString()}</span>
                        <span className="text-[11px] font-medium text-[#10a37f]">{Math.round((r.similarity || 0) * 100)}% match</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="border-border/60 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                  <History className="h-4 w-4 text-[#10a37f]" />
                  Document history
                </h2>
                <button onClick={loadHistory} disabled={historyLoading} className="text-xs text-[#10a37f] hover:text-[#0a7a5e] disabled:opacity-50 transition-colors">
                  {historyLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              {!historyLoaded && !historyLoading && (
                <p className="text-xs text-muted-foreground">Submit a document to see history, or{' '}
                  <button onClick={loadHistory} className="text-[#10a37f] underline underline-offset-2 hover:text-[#0a7a5e] transition-colors">load stored documents</button>.
                </p>
              )}
              {historyLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>}
              {historyLoaded && history.length === 0 && <p className="text-xs text-muted-foreground">No documents analyzed yet.</p>}
              {history.length > 0 && (
                <div className="space-y-2">
                  {history.slice(0, 8).map((doc) => (
                    <div key={doc.id} className="flex items-start justify-between gap-2 rounded-md border border-border/40 p-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.title}</p>
                        {doc.source_name && <p className="truncate text-[11px] text-muted-foreground">{doc.source_name}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-[#9b9b9b]">{new Date(doc.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Comparison section — status quo vs DocAnalyzer */}
        <div className="mt-14 border-t border-border/40 pt-10">
          <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[#9b9b9b]">The old way</p>
              <p className="text-[15px] leading-relaxed text-muted-foreground">Read through 20-page contracts manually. Miss the liability clause on page 14. Search by keyword, find false positives, miss context.</p>
            </div>
            <div className="border-l border-[#10a37f]/30 pl-6">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[#10a37f]">With DocAnalyzer</p>
              <p className="text-[15px] leading-relaxed">Paste any document. Get a structured summary, key points, and topics in seconds. Search across all past documents by meaning — not just keywords.</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-border/40 px-6 py-5 text-center text-xs text-muted-foreground">
        DocAnalyzer &mdash; AI-powered document intelligence &middot; Gemini 2.5 Flash
      </footer>
    </main>
  );
}
