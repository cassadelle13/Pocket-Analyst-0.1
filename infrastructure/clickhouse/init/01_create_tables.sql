-- PocketAnalyst ClickHouse Schema
-- Events table for storing all analytics events from Jitsu

CREATE DATABASE IF NOT EXISTS analytics;

-- Main events table
CREATE TABLE IF NOT EXISTS analytics.events
(
    event_id UUID DEFAULT generateUUIDv4(),
    event_type String,
    event_name String,
    timestamp DateTime64(3) DEFAULT now64(3),
    
    -- User identification
    user_id String,
    anonymous_id String,
    
    -- Session info
    session_id String,
    
    -- Source info
    source String DEFAULT 'web',  -- web, mobile, api
    
    -- Page/Screen info
    page_url String,
    page_title String,
    page_path String,
    referrer String,
    
    -- Device info
    device_type String,
    browser String,
    browser_version String,
    os String,
    os_version String,
    screen_width UInt16,
    screen_height UInt16,
    
    -- Geo info
    country String,
    city String,
    region String,
    
    -- Custom properties (JSON)
    properties String,
    
    -- Project/App identification
    project_id String,
    
    -- Timestamps
    received_at DateTime64(3) DEFAULT now64(3),
    
    INDEX idx_event_type event_type TYPE bloom_filter GRANULARITY 4,
    INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_project_id project_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (project_id, event_type, timestamp, user_id)
TTL timestamp + INTERVAL 365 DAY;

-- Users table for user profiles
CREATE TABLE IF NOT EXISTS analytics.users
(
    user_id String,
    anonymous_id String,
    
    -- Profile
    email String,
    name String,
    
    -- Timestamps
    created_at DateTime64(3),
    first_seen_at DateTime64(3),
    last_seen_at DateTime64(3),
    
    -- Traits (JSON)
    traits String,
    
    -- Project
    project_id String
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY (project_id, user_id);

-- Sessions table
CREATE TABLE IF NOT EXISTS analytics.sessions
(
    session_id String,
    user_id String,
    anonymous_id String,
    
    started_at DateTime64(3),
    ended_at DateTime64(3),
    duration_seconds UInt32,
    
    -- Session metrics
    page_views UInt16,
    events_count UInt16,
    
    -- Entry/Exit
    entry_page String,
    exit_page String,
    
    -- Source
    source String,
    medium String,
    campaign String,
    
    -- Device
    device_type String,
    browser String,
    os String,
    
    -- Geo
    country String,
    city String,
    
    -- Project
    project_id String
)
ENGINE = ReplacingMergeTree(ended_at)
ORDER BY (project_id, session_id);

-- Materialized view for daily metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.daily_metrics_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (project_id, date, event_type)
AS SELECT
    toDate(timestamp) as date,
    project_id,
    event_type,
    count() as event_count,
    uniqExact(user_id) as unique_users,
    uniqExact(session_id) as unique_sessions
FROM analytics.events
GROUP BY date, project_id, event_type;

-- Materialized view for retention cohorts
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.retention_cohorts_mv
ENGINE = SummingMergeTree()
ORDER BY (project_id, cohort_date, days_since_signup)
AS SELECT
    project_id,
    toDate(first_seen) as cohort_date,
    dateDiff('day', toDate(first_seen), toDate(timestamp)) as days_since_signup,
    uniqExact(e.user_id) as users_count
FROM analytics.events e
INNER JOIN (
    SELECT user_id, project_id, min(timestamp) as first_seen
    FROM analytics.events
    WHERE event_type = 'signup' OR event_name = 'signup'
    GROUP BY user_id, project_id
) u ON e.user_id = u.user_id AND e.project_id = u.project_id
GROUP BY project_id, cohort_date, days_since_signup;

-- Insert sample data for testing
INSERT INTO analytics.events (event_type, event_name, user_id, session_id, source, page_path, project_id, timestamp) VALUES
('page_view', 'page_view', 'user_001', 'sess_001', 'web', '/dashboard', 'proj_001', now() - INTERVAL 1 HOUR),
('page_view', 'page_view', 'user_001', 'sess_001', 'web', '/pricing', 'proj_001', now() - INTERVAL 55 MINUTE),
('button_click', 'upgrade_click', 'user_001', 'sess_001', 'web', '/pricing', 'proj_001', now() - INTERVAL 50 MINUTE),
('purchase', 'purchase', 'user_001', 'sess_001', 'web', '/checkout', 'proj_001', now() - INTERVAL 45 MINUTE),
('page_view', 'page_view', 'user_002', 'sess_002', 'mobile', '/home', 'proj_001', now() - INTERVAL 30 MINUTE),
('signup', 'signup', 'user_003', 'sess_003', 'web', '/signup', 'proj_001', now() - INTERVAL 20 MINUTE),
('feature_used', 'export_data', 'user_002', 'sess_002', 'mobile', '/export', 'proj_001', now() - INTERVAL 15 MINUTE),
('page_view', 'page_view', 'user_004', 'sess_004', 'api', '/api/data', 'proj_001', now() - INTERVAL 10 MINUTE),
('button_click', 'share_click', 'user_003', 'sess_003', 'web', '/dashboard', 'proj_001', now() - INTERVAL 5 MINUTE),
('page_view', 'page_view', 'user_005', 'sess_005', 'web', '/features', 'proj_001', now() - INTERVAL 2 MINUTE);
