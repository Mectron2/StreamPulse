# Kubernetes test stack

This directory intentionally uses one-replica StatefulSets for RabbitMQ,
PostgreSQL, Redis, Prometheus, and Grafana so their data is stored in PVCs.
It is a learning and local-minikube configuration, not a production setup.

Before deployment, copy `secrets.example.yaml` outside the repository, replace
the placeholders, and apply it after creating the namespace:

```powershell
kubectl apply -f k8s/namespace.yaml
kubectl apply -f <path-to-your-secret-file>
kubectl apply -k k8s
```

Open the frontend or Grafana with `minikube service -n stream-pulse frontend`
and `minikube service -n stream-pulse grafana`.
