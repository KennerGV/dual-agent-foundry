FROM rust:1-slim

WORKDIR /app

# Copy workspace manifest, lockfile, and crate source trees
COPY Cargo.toml Cargo.lock ./
COPY core ./core
COPY storage ./storage
COPY api ./api
COPY tests ./tests

# Pre-fetch dependencies and build test binaries during docker build
RUN cargo test --no-run

# Execute cargo test in offline mode when container starts
CMD ["cargo", "test", "--offline"]
