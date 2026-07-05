# Stream Pulse

StreamPulse is a real-time data processing platform built with a microservice architecture.

The project captures live public event streams, publishes raw events through a message broker, processes them with backend services, stores raw and aggregated data, caches hot state in Redis, and shows a live dashboard. The intended result is a system that visibly "pulses" under real load, with Grafana dashboards showing throughput, latency, and broker lag in real time.

The first supported source is the Wikimedia recent changes SSE stream:

```text
https://stream.wikimedia.org/v2/stream/recentchange
```

A second planned source is a public crypto WebSocket stream such as Binance or Coinbase. It will demonstrate the Bridge pattern by exposing multiple real-time sources through a single source interface.

## Target Stack

- NestJS microservices
- Kafka or RabbitMQ as the message broker
- PostgreSQL for relational aggregates and analytical queries
- MongoDB for raw event storage and ODM comparison
- Redis for hot aggregate caching
- React/Vite frontend
- Apollo Client cache
- Docker
- Kubernetes with minikube
- Helm
- Prometheus and Grafana
- Verdaccio as a private npm registry

## Architecture

![Stream Pulse architecture](./diagram.png)

The intended event flow is:

```text
Wikimedia SSE
  -> Ingester
  -> RabbitMQ
  -> Aggregator
  -> PostgreSQL
  -> RabbitMQ
  -> Gateway
  -> Client
```

Live processed events are delivered to clients through the gateway. Historical data is requested by the client through the gateway, resolved by the aggregator, and read from PostgreSQL.

## Services

### Ingester

The ingester captures external events and publishes raw messages to RabbitMQ.

Current behavior:

- Connects to the Wikimedia recent changes SSE stream.
- Parses SSE chunks safely.
- Publishes raw Wikimedia events to RabbitMQ.

RabbitMQ output:

```text
exchange: wikimedia
routing key: recentchange
queue: wikimedia.recentchange
```

### Aggregator

The aggregator is planned as the processing and persistence service.

Expected responsibilities:

- Consume raw events from `wikimedia.recentchange`.
- Normalize, validate, and aggregate events.
- Persist history and aggregate state in PostgreSQL.
- Publish processed events back to RabbitMQ.

RabbitMQ output:

```text
exchange: wikimedia
routing key: recentchange.processed
queue: wikimedia.recentchange.processed
```

### Gateway

The gateway is planned as the client-facing service.

Expected responsibilities:

- Subscribe to processed event queues.
- Stream live updates to clients.
- Handle client history requests.
- Ask the aggregator for historical data instead of reading PostgreSQL directly.

### PostgreSQL

PostgreSQL is planned as the durable history store for events, aggregates, and queryable state.

### MongoDB

MongoDB is planned as the raw event store.

Expected responsibilities:

- Store raw source events with minimal transformation.
- Provide an ODM-based persistence path for comparison with PostgreSQL ORM usage.
- Support analysis of ORM vs ODM tradeoffs on real project data.

### Redis

Redis is planned as the hot cache layer.

Expected responsibilities:

- Cache hot aggregates.
- Demonstrate write-through and cache-aside strategies.
- Expose cache hit rate through metrics.

### Frontend

The frontend is planned as a React/Vite live dashboard.

Expected responsibilities:

- Display live processed events from the gateway.
- Show historical and aggregated views.
- Use Apollo Client caching deliberately, including normalization and merge policies where needed.

### Observability

The platform is expected to expose production-style observability.

Expected responsibilities:

- Expose `/metrics` from each service.
- Scrape metrics with Prometheus.
- Visualize throughput, p95 latency, broker lag, and cache hit rate in Grafana.
- Provide readiness and liveness probes for Kubernetes.
- Define alerts for high latency and broker lag.

## Local Development

Requirements:

- Docker
- Docker Compose
- Node.js 22 for local service development

Start the current stack:

```bash
docker compose up --build
```

RabbitMQ Management UI:

```text
http://localhost:15672
username: guest
password: guest
```

The ingester service listens on:

```text
http://localhost:3000
```

## Current Repository Structure

```text
.
|-- AGENTS.md
|-- README.md
|-- diagram.png
|-- docker-compose.yml
`-- ingester/
```

Planned service directories:

```text
aggregator/
gateway/
frontend/
packages/
```

## RabbitMQ Concepts Used

Publishers send messages to exchanges. Consumers read messages from queues. Bindings connect exchanges to queues by routing key.

Current raw event route:

```text
Ingester
  -> exchange: wikimedia
  -> routing key: recentchange
  -> queue: wikimedia.recentchange
```

Planned processed event route:

```text
Aggregator
  -> exchange: wikimedia
  -> routing key: recentchange.processed
  -> queue: wikimedia.recentchange.processed
  -> Gateway
```

## Development Commands

For the ingester service:

```bash
cd ingester
npm run build
npm run lint
```

Run tests when test files exist:

```bash
npm test
```

Validate Docker Compose configuration:

```bash
docker compose config
```

## Project Notes

- The current implemented microservice is `ingester`.
- RabbitMQ and the ingester are wired in `docker-compose.yml`.
- Aggregator, PostgreSQL integration, MongoDB raw storage, Redis caching, gateway, frontend, Kubernetes, Helm, and observability are planned next.
- Architecture guidance for future agents and contributors is documented in `AGENTS.md`.

## Roadmap

### Month 1: Data Stream, Broker, and Bridge (v0.1)

Goal: ingest real streams and pass them through a message broker.

Learning focus:

- Message brokers such as Kafka or RabbitMQ.
- Broker vs bus/service mesh.
- Bridge pattern for source abstraction.
- Monorepo, npm/yarn workspaces, and dependency caching.

Project work:

- Ingest Wikimedia EventStreams.
- Add a second source, a public crypto WebSocket such as Binance or Coinbase.
- Expose both sources through a single Bridge-style source interface.
- Publish source events to the broker.
- Add a consumer that stores raw events.

Done when:

- Two real-time sources work through one source interface.
- Events flow through the broker.
- The project can explain broker vs bus using its own architecture.

### Month 2: Storage, ORM/ODM, and Explain Plan (v0.2)

Goal: store and aggregate the stream, then understand query plans.

Learning focus:

- `EXPLAIN` and `EXPLAIN ANALYZE`.
- Indexes for time-series aggregations.
- Practical ORM vs ODM differences.

Project work:

- Store aggregates in PostgreSQL through an ORM.
- Store raw events in MongoDB through an ODM.
- Add heavy analytical queries.
- Prepare an EXPLAIN report with before/after measurements.

Done when:

- Aggregations work.
- The explain report contains real before/after numbers.
- ORM vs ODM is explained using project code and data.

### Month 3: Caching at All Levels (v0.3)

Goal: speed up the system with deliberate caching strategies.

Learning focus:

- Redis write-through, write-back, and cache-aside.
- Browser caching with `Cache-Control` and `ETag`.
- Apollo Client normalization and merge policies.

Project work:

- Add Redis cache for hot aggregates.
- Implement write-through and cache-aside where appropriate.
- Add correct HTTP cache headers.
- Build the frontend with Apollo Client normalized cache.

Done when:

- Cache hits are visible in metrics.
- The project demonstrates three cache strategies and explains when each fits.
- Apollo Client avoids unnecessary repeated requests.

### Month 4: Kubernetes and Helm (v0.4)

Goal: run the system in Kubernetes and make deployment reproducible.

Learning focus:

- Kubernetes abstractions: Pod, Deployment, Service, ConfigMap, Secret, and Ingress.
- Service discovery through Kubernetes DNS and Services.
- Helm charts.

Project work:

- Deploy all services to minikube.
- Add a Helm chart for the whole application.
- Make services communicate through Kubernetes Services.
- Move runtime configuration into ConfigMaps and Secrets.

Done when:

- `helm install` starts the whole stack in minikube.
- Services communicate through service discovery.
- Services can scale through replicas.

### Month 5: Observability with Prometheus and Grafana (v0.5)

Goal: make the system fully observable.

Learning focus:

- Prometheus metrics and PromQL.
- Grafana dashboards.
- Alerting.
- Health, readiness, and liveness probes.

Project work:

- Add `/metrics` to every service.
- Configure Prometheus scraping.
- Build Grafana dashboards for throughput, p95 latency, broker lag, and cache hit rate.
- Add alerts for high latency and broker lag.
- Add readiness and liveness probes in Kubernetes.

Done when:

- Live dashboards show the system in real time.
- Alerts fire under simulated load.
- Kubernetes probes are configured for all services.
