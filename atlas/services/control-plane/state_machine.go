package main

type TaskState string

type TaskEvent string

const (
	StateQueued    TaskState = "queued"
	StateRunning   TaskState = "running"
	StateCompleted TaskState = "completed"
	StateFailed    TaskState = "failed"
)

const (
	EventSubmit      TaskEvent = "submit"
	EventClaim       TaskEvent = "claim"
	EventReportOK    TaskEvent = "report_ok"
	EventReportFail  TaskEvent = "report_fail"
	EventLeaseExpire TaskEvent = "lease_expire"
	EventRetry       TaskEvent = "retry"
)

var allowedTransitions = map[TaskState]map[TaskEvent]TaskState{
	StateQueued: {
		EventClaim: StateRunning,
	},
	StateRunning: {
		EventReportOK:    StateCompleted,
		EventReportFail:  StateFailed,
		EventLeaseExpire: StateQueued,
	},
	StateFailed: {
		EventRetry: StateQueued,
	},
}

func transition(from TaskState, ev TaskEvent) (TaskState, bool) {
	next, ok := allowedTransitions[from][ev]
	return next, ok
}
