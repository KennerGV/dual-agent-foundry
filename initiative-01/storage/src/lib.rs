pub mod wal;
pub mod compression;

pub use wal::*;
pub use compression::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_public_exports() {
        let mut wal = RingBufferWal::new(100);
        let offset = wal.append(b"test_payload").unwrap();
        assert_eq!(offset, 0);

        let compressor = Lz4Compressor::new();
        let compressed = compressor.compress(b"test_payload").unwrap();
        let decompressed = compressor.decompress(&compressed).unwrap();
        assert_eq!(decompressed, b"test_payload");
    }
}
