CREATE TABLE IF NOT EXISTS analytics.online_retail
(
    invoice_no String,
    stock_code String,
    description String,
    quantity Int32,
    invoice_date Nullable(DateTime),
    unit_price Float64,
    customer_id Nullable(String),
    country String
)
ENGINE = MergeTree()
ORDER BY (invoice_date, invoice_no, stock_code);

INSERT INTO analytics.online_retail
SELECT
    InvoiceNo,
    StockCode,
    Description,
    toInt32OrZero(Quantity),
    parseDateTimeBestEffortOrNull(InvoiceDate),
    toFloat64OrZero(UnitPrice),
    nullIf(trim(CustomerID), ''),
    Country
FROM file(
    '/var/lib/clickhouse/user_files/online_retail_II.csv',
    'CSVWithNames',
    'InvoiceNo String, StockCode String, Description String, Quantity String, InvoiceDate String, UnitPrice String, CustomerID String, Country String'
)
WHERE (SELECT count() FROM analytics.online_retail) = 0;
