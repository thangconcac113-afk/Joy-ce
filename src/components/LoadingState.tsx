export function LoadingState({ kind = "dashboard" }: { kind?: "dashboard" | "library" }) {
  return <div className={`loading-state loading-${kind}`} role="status" aria-label="Loading data" aria-busy="true">
    <span className="sr-only">Loading data...</span>
    <div className="loading-metrics" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <div className="card loading-metric" key={i}><i className="skeleton short" /><i className="skeleton number" /><i className="skeleton" /></div>)}</div>
    <div className="card loading-content" aria-hidden="true">{Array.from({ length: kind === "library" ? 6 : 4 }, (_, i) => <div className="loading-row" key={i}><i className="skeleton loading-thumb" /><span><i className="skeleton" /><i className="skeleton short" /></span><i className="skeleton short" /></div>)}</div>
  </div>;
}
