import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

type ProcessedEvent = {
  source: "wikimedia";
  id: string;
  timestamp: string;
  wiki: string;
  domain: string;
  project: "wikipedia" | "wikidata" | "commons" | "wiktionary" | "other";
  type: "edit" | "new" | "categorize" | "log" | "unknown";
  namespace: number;
  title: string;
  titleUrl?: string;
  user: string;
  isBot: boolean;
  isMinor: boolean;
  diffSize: number;
  comment: string;
  tags: string[];
  riskScore: number;
  importanceScore: number;
};

type BinanceTrade = {
  source: "binance";
  type: "aggTrade";
  id: string;
  aggregateTradeId: string;
  timestamp: string;
  symbol: string;
  price: string;
  quantity: string;
  quoteQuantity: string;
  side: "buy" | "sell";
  buyerIsMaker: boolean;
};

type EventsPage = { items: ProcessedEvent[]; nextCursor: string | null };
type TradesPage = { items: BinanceTrade[]; nextCursor: string | null };

const gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "";
const projectLabels: Record<ProcessedEvent["project"], string> = {
  wikipedia: "Wikipedia",
  wikidata: "Wikidata",
  commons: "Commons",
  wiktionary: "Wiktionary",
  other: "Other",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

function App() {
  const [events, setEvents] = useState<ProcessedEvent[]>([]);
  const [trades, setTrades] = useState<BinanceTrade[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [tradesCursor, setTradesCursor] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<"wikimedia" | "binance">(
    "wikimedia",
  );
  const [tradeSide, setTradeSide] = useState<"all" | "buy" | "sell">("all");
  const [connection, setConnection] = useState<
    "connecting" | "live" | "offline"
  >("connecting");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMoreTrades, setLoadingMoreTrades] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState<"all" | ProcessedEvent["project"]>(
    "all",
  );
  const [liveReceived, setLiveReceived] = useState(0);

  async function loadEvents(cursor?: string) {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${gatewayUrl}/events?${params}`);
    if (!response.ok) throw new Error("History is temporarily unavailable");
    return (await response.json()) as EventsPage;
  }

  async function loadTrades(cursor?: string) {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    const response = await fetch(`${gatewayUrl}/binance/trades?${params}`);
    if (!response.ok)
      throw new Error("Binance history is temporarily unavailable");
    return (await response.json()) as TradesPage;
  }

  useEffect(() => {
    let active = true;
    loadEvents()
      .then((page) => {
        if (!active) return;
        setEvents(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Unable to load history",
          );
      })
      .finally(() => active && setLoading(false));

    loadTrades()
      .then((page) => {
        if (!active) return;
        setTrades(page.items);
        setTradesCursor(page.nextCursor);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load Binance history",
          );
      });

    const socket = io(gatewayUrl, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setConnection("live"));
    socket.on("disconnect", () => setConnection("offline"));
    socket.on("connect_error", () => setConnection("offline"));
    socket.on("processed-event", (event: ProcessedEvent | BinanceTrade) => {
      if (event.source === "binance") {
        setTrades((current) =>
          [event, ...current.filter((item) => item.id !== event.id)].slice(
            0,
            250,
          ),
        );
      } else {
        setEvents((current) =>
          [event, ...current.filter((item) => item.id !== event.id)].slice(
            0,
            250,
          ),
        );
      }
      setLiveReceived((count) => count + 1);
    });

    return () => {
      active = false;
      socket.close();
    };
  }, []);

  const visibleEvents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesProject = project === "all" || event.project === project;
      const matchesQuery =
        !normalized ||
        event.title.toLowerCase().includes(normalized) ||
        event.user.toLowerCase().includes(normalized) ||
        event.domain.toLowerCase().includes(normalized);
      return matchesProject && matchesQuery;
    });
  }, [events, project, query]);

  const stats = useMemo(() => {
    const bots = events.filter((event) => event.isBot).length;
    const risky = events.filter((event) => event.riskScore >= 70).length;
    const diff = events.reduce(
      (sum, event) => sum + Math.abs(event.diffSize),
      0,
    );
    return {
      bots: events.length ? Math.round((bots / events.length) * 100) : 0,
      risky,
      averageDiff: events.length ? Math.round(diff / events.length) : 0,
    };
  }, [events]);

  const visibleTrades = useMemo(
    () =>
      trades.filter((trade) => tradeSide === "all" || trade.side === tradeSide),
    [trades, tradeSide],
  );

  const tradeStats = useMemo(
    () => ({
      lastPrice: trades[0]?.price ?? "0",
      baseVolume: trades.reduce(
        (sum, trade) => sum + Number(trade.quantity),
        0,
      ),
      quoteVolume: trades.reduce(
        (sum, trade) => sum + Number(trade.quoteQuantity),
        0,
      ),
    }),
    [trades],
  );

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await loadEvents(nextCursor);
      setEvents((current) => {
        const known = new Set(current.map((event) => event.id));
        return [
          ...current,
          ...page.items.filter((event) => !known.has(event.id)),
        ];
      });
      setNextCursor(page.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load more events",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleLoadMoreTrades() {
    if (!tradesCursor || loadingMoreTrades) return;
    setLoadingMoreTrades(true);
    setError(null);
    try {
      const page = await loadTrades(tradesCursor);
      setTrades((current) => {
        const known = new Set(current.map((trade) => trade.id));
        return [
          ...current,
          ...page.items.filter((trade) => !known.has(trade.id)),
        ];
      });
      setTradesCursor(page.nextCursor);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load more trades",
      );
    } finally {
      setLoadingMoreTrades(false);
    }
  }

  return (
    <div className="app-shell">
      <nav className="global-nav" aria-label="Global navigation">
        <div className="nav-inner">
          <a className="brand-mark" href="#top" aria-label="StreamPulse home">
            <span className="pulse-symbol" aria-hidden="true">
              ⌁
            </span>
            StreamPulse
          </a>
          <div className="nav-links">
            <a href="#live">Live</a>
            <a href="#history">History</a>
            <a href="#insights">Insights</a>
          </div>
          <span className={`connection-chip ${connection}`}>
            <span className="status-dot" />{" "}
            {connection === "live" ? "Live" : connection}
          </span>
        </div>
      </nav>

      <header className="sub-nav" id="top">
        <div className="sub-nav-inner">
          <div>
            <strong>
              {activeSource === "wikimedia"
                ? "Recent changes"
                : "BTC/USDT trades"}
            </strong>
            <span>
              {activeSource === "wikimedia"
                ? "Wikimedia intelligence, as it happens."
                : "Binance aggregate trades, as they happen."}
            </span>
          </div>
          <div
            className="source-switch"
            role="tablist"
            aria-label="Event source"
          >
            <button
              className={activeSource === "wikimedia" ? "active" : ""}
              onClick={() => setActiveSource("wikimedia")}
            >
              Wikimedia
            </button>
            <button
              className={activeSource === "binance" ? "active" : ""}
              onClick={() => setActiveSource("binance")}
            >
              Binance
            </button>
          </div>
        </div>
      </header>

      {activeSource === "wikimedia" ? (
        <main>
          <section className="hero-tile" id="live">
            <div className="hero-copy">
              <p className="eyebrow">Live knowledge stream</p>
              <h1>The world is editing.</h1>
              <p className="hero-lead">
                Watch every processed change arrive, understand its impact, and
                explore the history behind it.
              </p>
            </div>
            <div className="live-stage" aria-label="Latest live events">
              <div className="stage-header">
                <span>
                  <i className={`status-dot ${connection}`} /> Incoming now
                </span>
                <span>{liveReceived} received this session</span>
              </div>
              <div className="event-ribbons">
                {events.slice(0, 4).map((event, index) => (
                  <article
                    className="event-ribbon"
                    key={event.id}
                    style={
                      { "--delay": `${index * 70}ms` } as React.CSSProperties
                    }
                  >
                    <span className="ribbon-time">
                      {formatTime(event.timestamp)}
                    </span>
                    <div>
                      <strong>{event.title}</strong>
                      <p>
                        {projectLabels[event.project]} ·{" "}
                        {event.user || "Anonymous"}
                      </p>
                    </div>
                    <span className="score">{event.importanceScore}</span>
                  </article>
                ))}
                {!events.length && (
                  <div className="stage-empty">
                    Waiting for the first event…
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="insights-section" id="insights">
            <div className="section-heading">
              <p className="eyebrow blue">Signal at a glance</p>
              <h2>A clear view of the stream.</h2>
            </div>
            <div className="metrics-grid">
              <article className="metric-card">
                <span>Events loaded</span>
                <strong>{formatNumber(events.length)}</strong>
                <p>Live and historical records in view</p>
              </article>
              <article className="metric-card">
                <span>Bot activity</span>
                <strong>{stats.bots}%</strong>
                <p>Share of automated contributions</p>
              </article>
              <article className="metric-card">
                <span>High risk</span>
                <strong>{stats.risky}</strong>
                <p>Events with risk score 70 or higher</p>
              </article>
              <article className="metric-card">
                <span>Average change</span>
                <strong>{formatNumber(stats.averageDiff)}</strong>
                <p>Characters changed per event</p>
              </article>
            </div>
          </section>

          <section className="history-section" id="history">
            <div className="history-header">
              <div>
                <p className="eyebrow blue">Processed history</p>
                <h2>Every change, in context.</h2>
              </div>
              <div className="filters">
                <label className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search title, user, or domain"
                  />
                </label>
                <select
                  value={project}
                  onChange={(event) =>
                    setProject(event.target.value as typeof project)
                  }
                  aria-label="Filter by project"
                >
                  <option value="all">All projects</option>
                  {Object.entries(projectLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <div className="event-list" aria-busy={loading}>
              {visibleEvents.map((event) => (
                <article className="event-row" key={event.id}>
                  <div
                    className={`project-icon ${event.project}`}
                    aria-hidden="true"
                  >
                    {projectLabels[event.project].slice(0, 1)}
                  </div>
                  <div className="event-main">
                    <div className="event-title-line">
                      {event.titleUrl ? (
                        <a
                          href={event.titleUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {event.title}
                        </a>
                      ) : (
                        <strong>{event.title}</strong>
                      )}
                      <span className="type-pill">{event.type}</span>
                      {event.isBot && <span className="quiet-pill">Bot</span>}
                    </div>
                    <p>{event.comment || "No edit summary provided."}</p>
                    <div className="event-meta">
                      <span>{event.domain}</span>
                      <span>{event.user || "Anonymous"}</span>
                      <time>{formatTime(event.timestamp)}</time>
                    </div>
                  </div>
                  <div className="event-impact">
                    <strong
                      className={event.diffSize >= 0 ? "positive" : "negative"}
                    >
                      {event.diffSize >= 0 ? "+" : ""}
                      {formatNumber(event.diffSize)}
                    </strong>
                    <span>impact {event.importanceScore}</span>
                  </div>
                </article>
              ))}
              {loading && (
                <div className="list-message">Loading the stream…</div>
              )}
              {!loading && !visibleEvents.length && (
                <div className="list-message">
                  No events match these filters.
                </div>
              )}
            </div>
            {nextCursor && !query && project === "all" && (
              <button
                className="load-more"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load earlier events"}
              </button>
            )}
          </section>
        </main>
      ) : (
        <main>
          <section className="hero-tile crypto-hero" id="live">
            <div className="hero-copy">
              <p className="eyebrow">Live market stream</p>
              <h1>Bitcoin is moving.</h1>
              <p className="hero-lead">
                Watch BTC/USDT aggregate trades flow through the complete
                StreamPulse pipeline.
              </p>
            </div>
            <div className="live-stage" aria-label="Latest Binance trades">
              <div className="stage-header">
                <span>
                  <i className={`status-dot ${connection}`} /> Incoming now
                </span>
                <span>{trades.length} trades loaded</span>
              </div>
              <div className="event-ribbons">
                {trades.slice(0, 4).map((trade, index) => (
                  <article
                    className="event-ribbon"
                    key={trade.id}
                    style={
                      { "--delay": `${index * 70}ms` } as React.CSSProperties
                    }
                  >
                    <span className="ribbon-time">
                      {formatTime(trade.timestamp)}
                    </span>
                    <div>
                      <strong>${Number(trade.price).toLocaleString()}</strong>
                      <p>
                        {trade.quantity} BTC · {trade.side.toUpperCase()}
                      </p>
                    </div>
                    <span className={`trade-side ${trade.side}`}>
                      {trade.side}
                    </span>
                  </article>
                ))}
                {!trades.length && (
                  <div className="stage-empty">
                    Waiting for the first trade…
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="insights-section" id="insights">
            <div className="section-heading">
              <p className="eyebrow blue">Market at a glance</p>
              <h2>BTC/USDT activity.</h2>
            </div>
            <div className="metrics-grid">
              <article className="metric-card">
                <span>Trades loaded</span>
                <strong>{formatNumber(trades.length)}</strong>
                <p>Live and historical aggregate trades</p>
              </article>
              <article className="metric-card">
                <span>Last price</span>
                <strong>
                  ${Number(tradeStats.lastPrice).toLocaleString()}
                </strong>
                <p>Latest observed BTC/USDT price</p>
              </article>
              <article className="metric-card">
                <span>BTC volume</span>
                <strong>{tradeStats.baseVolume.toFixed(4)}</strong>
                <p>Base volume in the loaded window</p>
              </article>
              <article className="metric-card">
                <span>Quote volume</span>
                <strong>${formatNumber(tradeStats.quoteVolume)}</strong>
                <p>USDT volume in the loaded window</p>
              </article>
            </div>
          </section>

          <section className="history-section" id="history">
            <div className="history-header">
              <div>
                <p className="eyebrow blue">Processed history</p>
                <h2>Every trade, precisely recorded.</h2>
              </div>
              <div className="filters">
                <select
                  value={tradeSide}
                  onChange={(event) =>
                    setTradeSide(event.target.value as typeof tradeSide)
                  }
                  aria-label="Filter by trade side"
                >
                  <option value="all">All sides</option>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <div className="event-list">
              {visibleTrades.map((trade) => (
                <article className="event-row trade-row" key={trade.id}>
                  <div
                    className={`project-icon ${trade.side}`}
                    aria-hidden="true"
                  >
                    {trade.side === "buy" ? "B" : "S"}
                  </div>
                  <div className="event-main">
                    <div className="event-title-line">
                      <strong>{trade.symbol}</strong>
                      <span className={`type-pill ${trade.side}`}>
                        {trade.side}
                      </span>
                    </div>
                    <p>
                      {trade.quantity} BTC at ${trade.price}
                    </p>
                    <div className="event-meta">
                      <span>Trade #{trade.aggregateTradeId}</span>
                      <time>{formatTime(trade.timestamp)}</time>
                    </div>
                  </div>
                  <div className="event-impact">
                    <strong>
                      ${Number(trade.quoteQuantity).toLocaleString()}
                    </strong>
                    <span>quote value</span>
                  </div>
                </article>
              ))}
              {!visibleTrades.length && (
                <div className="list-message">No trades match this filter.</div>
              )}
            </div>
            {tradesCursor && tradeSide === "all" && (
              <button
                className="load-more"
                onClick={handleLoadMoreTrades}
                disabled={loadingMoreTrades}
              >
                {loadingMoreTrades ? "Loading…" : "Load earlier trades"}
              </button>
            )}
          </section>
        </main>
      )}

      <footer>
        <strong>StreamPulse</strong>
        <span>Real-time multi-source processing platform.</span>
      </footer>
    </div>
  );
}

export default App;
