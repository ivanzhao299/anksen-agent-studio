# Repository Agent Instructions

Before planning or implementing any task in this repository, read `CHATGPT_CONTEXT.md` in full and treat it as the authoritative product-positioning, architecture, priority, and safety handoff.

Do not introduce a second Planner, Scheduler, Worker, Runtime, Goal, Task, Queue, or State Machine. Business applications remain managed applications connected to the Studio control plane.

Do not push, merge, deploy, modify production, or enable a real Runtime unless the user explicitly authorizes that action in the current request and all existing governance gates pass.
