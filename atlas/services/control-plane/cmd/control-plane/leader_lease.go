package main

import (
	"database/sql"
	"log"
	"time"
)

type LeaderLease struct {
	Holder    string
	ExpiresAt time.Time
	Token     int64
}

func acquireLeaderLease(db *sql.DB, leaderID string, ttl time.Duration) (int64, bool) {
	if db == nil {
		return 0, false
	}
	expires := time.Now().UTC().Add(ttl)
	_, _ = db.Exec("INSERT OR IGNORE INTO leader_lease (id, holder, expires_at, token) VALUES ('primary', ?, ?, 0)", leaderID, expires.Format(time.RFC3339))
	lease, ok := readLeaderLease(db)
	if !ok {
		return 0, false
	}
	if lease.Holder == leaderID {
		return lease.Token, true
	}
	if time.Now().UTC().After(lease.ExpiresAt) {
		newToken := lease.Token + 1
		_, _ = db.Exec("UPDATE leader_lease SET holder=?, expires_at=?, token=? WHERE id='primary'", leaderID, expires.Format(time.RFC3339), newToken)
		return newToken, true
	}
	return 0, false
}

func renewLeaderLease(db *sql.DB, leaderID string, token int64, ttl time.Duration) bool {
	if db == nil {
		return false
	}
	expires := time.Now().UTC().Add(ttl).Format(time.RFC3339)
	res, err := db.Exec("UPDATE leader_lease SET expires_at=? WHERE id='primary' AND holder=? AND token=?", expires, leaderID, token)
	if err != nil {
		log.Printf("leader lease renew error: %v", err)
		return false
	}
	aff, _ := res.RowsAffected()
	return aff == 1
}

func renewLeaderLeaseLoop(db *sql.DB, leaderID string, token int64, ttl time.Duration, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for range ticker.C {
		ok := renewLeaderLease(db, leaderID, token, ttl)
		if !ok {
			leaderActive = false
			log.Printf("leader lease renew failed; stepping down")
			return
		}
	}
}

func readLeaderLease(db *sql.DB) (LeaderLease, bool) {
	var holder, exp string
	var token int64
	row := db.QueryRow("SELECT holder, expires_at, token FROM leader_lease WHERE id='primary'")
	if err := row.Scan(&holder, &exp, &token); err != nil {
		return LeaderLease{}, false
	}
	t, err := time.Parse(time.RFC3339, exp)
	if err != nil {
		return LeaderLease{}, false
	}
	return LeaderLease{Holder: holder, ExpiresAt: t, Token: token}, true
}
