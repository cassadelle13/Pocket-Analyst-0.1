# Vector-based ingest service
FROM timberio/vector:0.38.0-alpine

# Copy Vector configuration
COPY vector.yaml /etc/vector/vector.yaml

# Expose ingest HTTP port
EXPOSE 9000

# Run Vector in foreground
CMD ["--config", "/etc/vector/vector.yaml"]
