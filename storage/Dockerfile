FROM clickhouse/clickhouse-server:23.8

WORKDIR /

COPY init/ /docker-entrypoint-initdb.d/

EXPOSE 8123 9000
