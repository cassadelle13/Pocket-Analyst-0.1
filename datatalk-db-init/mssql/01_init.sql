IF DB_ID(N'datatalk') IS NULL
BEGIN
    CREATE DATABASE datatalk;
END
GO

USE datatalk;
GO

IF OBJECT_ID(N'dbo.sample_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sample_events (
        id INT IDENTITY(1,1) PRIMARY KEY,
        event_name NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
