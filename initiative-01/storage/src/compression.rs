use crate::wal::StorageError;

pub trait Compressor {
    fn compress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError>;
    fn decompress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Lz4Compressor;

impl Lz4Compressor {
    pub fn new() -> Self {
        Self
    }
}

impl Compressor for Lz4Compressor {
    fn compress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError> {
        Ok(lz4_flex::compress_prepend_size(input))
    }

    fn decompress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError> {
        lz4_flex::decompress_size_prepended(input)
            .map_err(|e| StorageError::CompressionError(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lz4_compress_decompress_roundtrip() {
        let compressor = Lz4Compressor::new();
        let original_data = b"Hello, AegisPulse LZ4 telemetry compression tests!";

        let compressed = compressor.compress(original_data).expect("Compression should succeed");
        let decompressed = compressor.decompress(&compressed).expect("Decompression should succeed");

        assert_eq!(decompressed, original_data);
    }

    #[test]
    fn test_lz4_decompress_invalid_data() {
        let compressor = Lz4Compressor::new();
        let invalid_data = b"not compressed lz4 payload";

        let result = compressor.decompress(invalid_data);
        assert!(matches!(result, Err(StorageError::CompressionError(_))));
    }
}
