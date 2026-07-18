# Night Shift Kernel Architecture

```text
access-center / model-gateway / console
              | authorized Studio scope
planning-center -> adapters -> orchestrator-core autonomous kernel
worker-pool     -> adapters -> worker registry / claim / lease
                              | transactional SQL
                              +-> audit + outbox
                              | injected execution port
                        runtime-adapters (NoRuntime by default)
                              |
                    managed project via project-connector
```

The kernel owns durable orchestration facts. Control-plane packages authorize and propose; they do not duplicate those facts. Runtime adapters execute only after explicit wiring. Smart Park is below the project-connector boundary.
