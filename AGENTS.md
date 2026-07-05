# AGENTS.md

## Project Overview

StreamPulse is a real-time data processing platform built with a microservice architecture.

The system captures events from external streaming sources, publishes raw events into a message broker, processes and aggregates them, stores raw data and queryable aggregates, caches hot state in Redis, and streams live/processed data to clients through a gateway.

The long-term goal is a live platform that visibly pulses under real load. Grafana dashboards should show throughput, latency, broker lag, and cache hit rate in real time.

Target stack:

- NestJS microservices.
- Kafka or RabbitMQ as the message broker.
- PostgreSQL for relational aggregates and analytical queries.
- MongoDB for raw event storage.
- Redis for hot aggregate caching.
- React/Vite frontend.
- Apollo Client cache.
- Docker.
- Kubernetes with minikube.
- Helm.
- Prometheus and Grafana.
- Verdaccio as a private npm registry.

Current source scope:

- Wikimedia recent changes SSE stream.

Future source scope:

- Public crypto WebSocket stream such as Binance or Coinbase.
- Additional event streams should be added behind a Bridge-style source interface without coupling them to client delivery logic.

## Target Architecture

Primary flow:

```text
Wikimedia SSE
  -> Ingester
  -> RabbitMQ exchange: wikimedia, routing key: recentchange
  -> Aggregator
  -> MongoDB raw storage and PostgreSQL aggregates
  -> Redis hot cache
  -> RabbitMQ exchange: wikimedia, routing key: recentchange.processed
  -> Gateway
  -> React/Vite client streams
```

History flow:

```text
Client
  -> Gateway
  -> Aggregator
  -> Redis cache or PostgreSQL
  -> Aggregator
  -> Gateway
  -> Client
```

Live stream flow:

```text
RabbitMQ queue: wikimedia.recentchange.processed
  -> Gateway
  -> Client
```

## Service Responsibilities

### Source Bridge

External sources must be hidden behind a common source abstraction once the second source is introduced.

Responsibilities:

- Provide one interface for different real-time sources.
- Support Wikimedia SSE and crypto WebSocket sources through separate adapters.
- Normalize source metadata such as source name, event type, event timestamp, and original event id when available.
- Keep source transport details out of the aggregator, gateway, and frontend.

Rules:

- Do not duplicate broker publishing logic in every source adapter.
- Do not make downstream services depend on source transport details such as SSE chunking or WebSocket frames.
- Add the Bridge abstraction when the second real source is implemented; avoid over-engineering it before then.

### Ingester

The ingester is responsible only for external event capture and raw event publication.

Responsibilities:

- Connect to external event sources.
- For Wikimedia, consume `https://stream.wikimedia.org/v2/stream/recentchange` as SSE.
- For the future crypto source, consume a public WebSocket stream such as Binance or Coinbase.
- Parse transport framing safely, including partial chunks and multi-line SSE `data:` fields.
- Publish valid raw events to RabbitMQ.
- Reconnect to external streams after transient failures.
- Avoid writing directly to PostgreSQL.
- Avoid writing directly to MongoDB unless a task explicitly changes ownership and explains why.
- Avoid talking directly to clients.
- Avoid doing aggregation or domain analytics.

RabbitMQ output:

```text
exchange: wikimedia
routing key: recentchange
queue: wikimedia.recentchange
payload: raw Wikimedia recentchange JSON
```

### RabbitMQ

RabbitMQ is the current messaging backbone between services. The target learning scope allows Kafka or RabbitMQ, but this repository currently uses RabbitMQ.

Responsibilities:

- Decouple publishers from consumers.
- Store durable messages while consumers are unavailable.
- Route events by exchange and routing key.
- Support independent scaling of ingesters, aggregators, and gateways.

Conventions:

- Use durable exchanges and queues for business events.
- Use persistent messages for events that must survive broker restart.
- Prefer topic exchanges when event categories can grow.
- Name exchanges by event domain, for example `wikimedia`.
- Name routing keys by event type, for example `recentchange` and `recentchange.processed`.
- Name queues by consumer purpose or event type, for example `wikimedia.recentchange`.
- If Kafka is introduced later, document the equivalent topic, partitioning, consumer group, and offset/lag model before replacing RabbitMQ concepts.

### Aggregator

The aggregator is responsible for consuming raw events, deriving useful processed events, and maintaining historical state.

Responsibilities:

- Subscribe to raw event queues such as `wikimedia.recentchange`.
- Validate and normalize incoming event payloads.
- Calculate aggregates needed by the product.
- Persist raw events to MongoDB unless the ingestion ownership changes explicitly.
- Persist relational aggregates and analytical state to PostgreSQL.
- Use Redis for hot aggregate reads once caching is introduced.
- Publish processed events back to RabbitMQ for gateway consumption.
- Serve history queries from the gateway when the system needs historical data.
- Expose metrics for throughput, processing latency, persistence latency, and broker lag.

RabbitMQ input:

```text
queue: wikimedia.recentchange
payload: raw Wikimedia recentchange JSON
```

RabbitMQ output:

```text
exchange: wikimedia
routing key: recentchange.processed
queue: wikimedia.recentchange.processed
payload: processed event or aggregate update
```

Database:

- MongoDB is the raw event store.
- PostgreSQL is the system of record for relational aggregates and queryable history.
- Aggregator owns writes to MongoDB and PostgreSQL unless a future split creates a dedicated storage service.
- Gateway should not write event history directly.

### PostgreSQL

PostgreSQL stores relational aggregates, queryable history, and analytical state.

Responsibilities:

- Store event history required by clients.
- Store aggregate snapshots or rollups if needed.
- Support gateway history requests through aggregator-owned query APIs.
- Support EXPLAIN and EXPLAIN ANALYZE work for heavy analytical queries.

Conventions:

- Keep schema changes explicit and migration-based once a database migration tool is introduced.
- Do not let every service write arbitrary data into the same tables.
- Prefer aggregator-owned tables for event history and aggregates.
- Add indexes deliberately for time-series aggregation patterns and document before/after measurements.

### MongoDB

MongoDB stores raw source events.

Responsibilities:

- Store raw Wikimedia and crypto events with minimal transformation.
- Support ODM-based persistence.
- Preserve enough original payload to debug source parsing and downstream aggregation.
- Provide the project example for ORM vs ODM comparison.

Conventions:

- Keep raw events append-oriented.
- Include source metadata on every document.
- Avoid using MongoDB as the aggregate query store unless a task explicitly calls for it.

### Redis

Redis stores hot aggregate cache entries.

Responsibilities:

- Cache frequently requested aggregates.
- Support cache-aside for read-heavy history or aggregate endpoints.
- Support write-through for aggregates updated directly by the aggregator.
- Expose cache hit/miss metrics.

Conventions:

- Use explicit TTLs where stale data is acceptable.
- Document cache invalidation behavior with the endpoint or aggregate that uses it.
- Do not hide database correctness problems behind Redis.

### Gateway

The gateway is the client-facing service.

Responsibilities:

- Stream live processed events to clients.
- Subscribe to processed RabbitMQ queues, not raw ingester queues, unless explicitly required.
- Handle client protocols such as WebSocket or SSE.
- Request history from the aggregator.
- Serve GraphQL or HTTP APIs needed by the React/Vite frontend.
- Set deliberate HTTP cache headers such as `Cache-Control` and `ETag` where appropriate.
- Expose gateway metrics for connected clients, stream fanout, request latency, and errors.
- Avoid doing heavy aggregation itself.
- Avoid direct external source ingestion.

RabbitMQ input:

```text
queue: wikimedia.recentchange.processed
payload: processed event or aggregate update
```

Client output:

```text
Gateway -> Client streams
```

History:

```text
Client -> Gateway -> Aggregator -> PostgreSQL
```

### Frontend

The frontend is a React/Vite live dashboard.

Responsibilities:

- Show live event flow from the gateway.
- Show historical and aggregate views.
- Use Apollo Client cache deliberately.
- Avoid unnecessary repeated network requests through normalized cache and merge policies.
- Make the system visibly live under real load.

Conventions:

- Keep browser cache behavior explicit.
- Do not hardcode infrastructure URLs when environment configuration is available.
- Display metrics and event flow clearly enough to demonstrate the platform.

### Observability

Every service must be designed for observability.

Responsibilities:

- Expose `/metrics` once Prometheus is introduced.
- Track throughput, latency p95, broker lag, cache hit rate, errors, and reconnects.
- Add health, readiness, and liveness endpoints/probes.
- Provide Grafana dashboards that show the system in real time.
- Add alerts for high latency and broker lag.

Conventions:

- Metrics names should be stable and documented near the service that emits them.
- Avoid logging entire high-volume payloads in production paths.
- Prefer structured logs for cross-service debugging once logging is formalized.

### Kubernetes and Helm

The target deployment environment is minikube with Helm.

Responsibilities:

- Provide Deployments, Services, ConfigMaps, Secrets, and Ingress where needed.
- Use Kubernetes Service discovery instead of hardcoded container names outside local Docker Compose.
- Make `helm install` capable of starting the complete stack once v0.4 is reached.
- Support horizontal scaling through replicas.

Conventions:

- Keep Docker Compose useful for local development.
- Keep Helm values configurable for service ports, broker URLs, database URLs, Redis URLs, and observability settings.
- Do not put secrets directly in committed manifests.

## Messaging Rules

- Publishers publish to exchanges, not directly to queues, unless there is a deliberate reason to use the default exchange.
- Consumers consume from queues.
- Bindings connect exchanges to queues through routing keys.
- Raw event routing keys should describe source event types.
- Processed event routing keys should use a clear suffix such as `.processed`.
- Message payloads should be JSON unless a service explicitly documents another format.
- Include enough metadata for downstream services to identify event source, event type, timestamp, and original payload identity.

Suggested payload envelope for processed events:

```json
{
  "source": "wikimedia",
  "type": "recentchange.processed",
  "occurredAt": "2026-07-05T00:00:00.000Z",
  "processedAt": "2026-07-05T00:00:01.000Z",
  "data": {}
}
```

Raw Wikimedia events may initially be published as the original event JSON. If multiple sources are added, introduce a consistent envelope for raw events too.

Required raw envelope after the second source is introduced:

```json
{
  "source": "wikimedia",
  "type": "recentchange",
  "occurredAt": "2026-07-05T00:00:00.000Z",
  "ingestedAt": "2026-07-05T00:00:01.000Z",
  "externalId": "optional-source-event-id",
  "data": {}
}
```

## Reliability Rules

- Services must tolerate RabbitMQ being temporarily unavailable.
- Services should reconnect after transient network failures.
- Use durable queues and exchanges for event pipelines.
- Use persistent messages for events that should survive RabbitMQ restarts.
- Consumers should acknowledge messages only after successful processing.
- Failed processing should not silently drop messages.
- Introduce dead-letter queues before adding complex retry behavior.
- Avoid unbounded in-memory buffers.
- Broker lag must be measurable before the observability milestone is considered complete.
- Redis cache misses must fall back to the source of truth, not fail the request unnecessarily.

## Development Guidelines

- Keep each microservice focused on one responsibility.
- Prefer explicit module boundaries over shared mutable state.
- Do not put source-specific parsing logic in the gateway.
- Do not put client protocol code in the ingester.
- Do not bypass RabbitMQ for event delivery between services.
- Use environment variables for infrastructure addresses, exchange names, queue names, routing keys, and ports.
- Keep Docker Compose useful for local development, not as the only production deployment description.
- Design new services so they can run both in Docker Compose and Kubernetes.
- Prefer source adapters behind the Bridge abstraction once multiple sources exist.
- Add observability hooks as part of service design, not as a last-minute afterthought.
- Keep frontend caching decisions visible in code, especially Apollo Client normalization and merge policies.

## Current Repository Notes

- The current implemented service is `ingester`.
- `docker-compose.yml` starts RabbitMQ and the ingester.
- RabbitMQ Management UI is expected at `http://localhost:15672`.
- Default RabbitMQ credentials for local development are `guest` / `guest`.

## Expected Future Services

Recommended service directories:

```text
ingester/
aggregator/
gateway/
frontend/
packages/
```

Recommended infrastructure additions:

```text
docker-compose.yml
postgres service
mongodb service
redis service
rabbitmq service
shared environment variables
database migrations
k8s or charts directory
prometheus configuration
grafana dashboards
```

Recommended future package areas, only when duplication justifies them:

```text
packages/contracts/
packages/config/
packages/observability/
```

## Verification Expectations

When changing code:

- Run the relevant service build.
- Run lint for touched TypeScript services.
- Run tests when tests exist.
- Validate Docker Compose syntax after compose changes:

```bash
docker compose config
```

For RabbitMQ behavior:

- Confirm exchange exists.
- Confirm queue exists.
- Confirm binding exists.
- Confirm messages arrive in the expected queue.

For future storage and observability behavior:

- Confirm MongoDB receives raw events.
- Confirm PostgreSQL receives aggregates.
- Confirm Redis hit/miss metrics are visible.
- Confirm Prometheus scrapes every service with `/metrics`.
- Confirm Grafana dashboards show throughput, latency, lag, and cache hit rate.
- Confirm `helm install` can start the stack in minikube once Helm support exists.

## Roadmap-Aware Architecture

Month 1 / v0.1:

- Keep the ingester aligned with the Bridge pattern.
- Add Wikimedia SSE and crypto WebSocket sources behind one source interface.
- Ensure events flow through the broker before storage or frontend shortcuts.

Month 2 / v0.2:

- Store raw events in MongoDB through an ODM.
- Store aggregates in PostgreSQL through an ORM.
- Add query plans and before/after measurements for heavy analytical queries.

Month 3 / v0.3:

- Add Redis for hot aggregates.
- Demonstrate write-through and cache-aside.
- Add HTTP cache headers and Apollo Client cache behavior.

Month 4 / v0.4:

- Add Kubernetes manifests or Helm charts.
- Use ConfigMaps, Secrets, Services, Deployments, and Ingress deliberately.
- Ensure service discovery works through Kubernetes Services.

Month 5 / v0.5:

- Add Prometheus metrics to every service.
- Add Grafana dashboards for throughput, latency p95, broker lag, and cache hit rate.
- Add alerts and Kubernetes readiness/liveness probes.

## Non-Goals For Now

- Do not introduce Kubernetes manifests until local microservice boundaries are stable or the v0.4 milestone begins.
- Do not introduce a shared library unless duplication across services becomes meaningful.
- Do not add multiple source abstractions before the second real source exists, but preserve room for the Bridge pattern.
- Do not make the gateway depend on raw Wikimedia-specific payloads unless the client explicitly needs raw events.
- Do not add Redis, MongoDB, Prometheus, Grafana, Helm, or Verdaccio as decorative dependencies; each must serve a roadmap requirement.
