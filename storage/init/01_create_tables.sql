CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.events
(
    event_name String,
    user_id String,
    properties String,
    timestamp DateTime64(3, 'UTC') DEFAULT now()
)
ENGINE = MergeTree()
ORDER BY (timestamp, event_name);
