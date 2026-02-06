# SQL Hot Path Report

- Generated at: 2026-02-06T12:35:37.071Z
- Sample merchantId: cmkgqtylm0000tawi21ts7099
- Sample communicationTaskId: (none)

## Outbox pending queue

- Planning time: 0.229 ms
- Execution time: 0.028 ms
- Elapsed (script): 2.000 ms
- Seq scans: 0

## Outbox stale sending recovery

- Planning time: 0.078 ms
- Execution time: 0.345 ms
- Elapsed (script): 1.000 ms
- Seq scans: 0

## Communications due tasks

- Planning time: 0.094 ms
- Execution time: 0.011 ms
- Elapsed (script): 1.000 ms
- Seq scans: 0

## Communications recipients batch

Skipped: No CommunicationTask rows found

## Data import stale jobs

- Planning time: 0.167 ms
- Execution time: 0.037 ms
- Elapsed (script): 2.000 ms
- Seq scans: 0

## Portal staff list hot path

- Planning time: 0.141 ms
- Execution time: 0.017 ms
- Elapsed (script): 1.000 ms
- Seq scans: 1
- Seq scan details:
  - Staff rows(plan=1, actual=1)

