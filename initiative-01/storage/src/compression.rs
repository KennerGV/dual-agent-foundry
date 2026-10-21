use crate::wal::StorageError;

pub trait Compressor {
    fn compress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError>;
    fn decompress(&self, input: &[u8]) -> Result<Vec<u8>, StorageError>;
}
