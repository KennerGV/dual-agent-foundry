#[derive(Debug, Clone, PartialEq)]
pub enum StorageError {
    WriteError(String),
    ReadError(String),
    CompressionError(String),
    BufferFull,
}

pub trait CircularWal {
    fn append(&mut self, data: &[u8]) -> Result<u64, StorageError>;
    fn read_offset(&self, offset: u64, len: usize) -> Result<Vec<u8>, StorageError>;
}
