# Tracker — bulk-order-export

> Status of every task in the epic. `implement` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| [T01](./t01-promote-the-staged-order-exports-and-orders-index-migrations.md) | Promote the staged order_exports and orders-index migrations | migration | <TBD lead> | S | — | todo |
| [T02](./t02-add-the-export-filter-rules-and-the-kyiv-calendar-helper.md) | Add the export filter rules and the Kyiv calendar helper | domain | <TBD lead> | M | — | todo |
| [T03](./t03-model-the-order-export-aggregate-status-transitions-expiry-a.md) | Model the order export aggregate: status transitions, expiry and listing window | domain | <TBD lead> | M | — | todo |
| [T04](./t04-add-the-export-orders-capability-to-the-staff-module.md) | Add the export orders capability to the staff module | domain | <TBD lead> | S | — | todo |
| [T05](./t05-implement-the-order-exports-repository.md) | Implement the order_exports repository | infra | <TBD lead> | L | T01, T03 | todo |
| [T06](./t06-write-the-export-csv-writer-with-fixed-columns-value-formats.md) | Write the export CSV writer with fixed columns, value formats and formula escaping | infra | <TBD lead> | M | — | todo |
| [T07](./t07-add-the-orders-snapshot-reader-repeatable-read-cursor.md) | Add the orders snapshot reader (REPEATABLE READ cursor) | infra | <TBD lead> | M | T01, T02 | todo |
| [T08](./t08-add-the-exports-bucket-client-upload-delete-5-minute-signed.md) | Add the exports bucket client (upload, delete, 5-minute signed URL) | infra | <TBD lead> | S | — | todo |
| [T09](./t09-implement-the-request-export-use-case.md) | Implement the request-export use case | app | <TBD lead> | M | T02, T03, T04, T05 | todo |
| [T10](./t10-implement-the-list-exports-and-resolve-download-use-cases.md) | Implement the list-exports and resolve-download use cases | app | <TBD lead> | M | T03, T04, T05, T08 | todo |
| [T11](./t11-implement-the-export-build-job.md) | Implement the export build job | app | <TBD lead> | L | T05, T06, T07, T08 | todo |
| [T12](./t12-implement-the-export-email-job-and-the-ready-failed-template.md) | Implement the export email job and the ready/failed templates | app | <TBD lead> | M | T04, T05 | todo |
| [T13](./t13-implement-the-reaper-and-the-daily-sweeper-jobs.md) | Implement the reaper and the daily sweeper jobs | app | <TBD lead> | M | T05, T08 | todo |
| [T14](./t14-expose-the-exports-http-endpoints-with-error-mapping.md) | Expose the exports HTTP endpoints with error mapping | ports | <TBD lead> | M | T09, T10 | todo |
| [T15](./t15-wire-the-export-worker-process-and-mount-the-exports-api.md) | Wire the export worker process and mount the exports API | wiring | <TBD lead> | S | T11, T12, T13, T14 | todo |
| [T16](./t16-add-the-exports-ui-foundation-api-client-statepanel-inlineno.md) | Add the exports UI foundation: API client, StatePanel, InlineNotice, access-denied and entry points | ui | <TBD lead> | M | — | todo |
| [T17](./t17-build-the-export-request-form-scr-02.md) | Build the export request form (SCR-02) | ui | <TBD lead> | M | T16 | todo |
| [T18](./t18-build-the-exports-list-with-polling-and-paging-scr-03.md) | Build the Exports list with polling and paging (SCR-03) | ui | <TBD lead> | M | T16 | todo |
| [T19](./t19-build-the-download-route-the-expired-notice-scr-07-and-the-s.md) | Build the download route, the expired notice (SCR-07) and the sign-in return path | ui | <TBD lead> | M | T16 | todo |
| [T20](./t20-add-the-cross-cutting-integration-and-load-tests-snapshot-ds.md) | Add the cross-cutting integration and load tests (snapshot, DST, role change, retention, storefront impact) | tests | <TBD lead> | M | T15 | todo |

**Total:** 20 tasks, ~18 person-days (S = ½ day, M = 1 day).
