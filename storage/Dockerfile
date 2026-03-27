FROM clickhouse/clickhouse-server:23.8

WORKDIR /

COPY init/ /docker-entrypoint-initdb.d/
RUN mkdir -p /var/lib/clickhouse/user_files
COPY init/online_retail_II.csv /var/lib/clickhouse/user_files/online_retail_II.csv

EXPOSE 8123 9000
