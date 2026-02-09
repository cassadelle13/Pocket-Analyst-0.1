-- Create databases for Jitsu and Dify

CREATE DATABASE jitsu;
CREATE DATABASE dify;

-- Create user for Jitsu
CREATE USER jitsu WITH PASSWORD 'jitsu';
GRANT ALL PRIVILEGES ON DATABASE jitsu TO jitsu;

-- Grant privileges to postgres user for Dify
GRANT ALL PRIVILEGES ON DATABASE dify TO postgres;
