#[derive(Debug, Clone, PartialEq, Eq)]
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

/// Fixed-capacity in-memory ring buffer implementing a circular Write-Ahead Log.
#[derive(Debug, Clone)]
pub struct RingBufferWal {
    buffer: Vec<u8>,
    capacity: usize,
    head: u64,
    tail: u64,
}

pub type CircularBufferWal = RingBufferWal;

impl RingBufferWal {
    /// Creates a new `RingBufferWal` with the specified byte capacity.
    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: vec![0; capacity],
            capacity,
            head: 0,
            tail: 0,
        }
    }

    /// Returns the total byte capacity of the ring buffer.
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Returns the current earliest valid logical offset.
    pub fn head(&self) -> u64 {
        self.head
    }

    /// Returns the current end logical offset (total bytes written).
    pub fn tail(&self) -> u64 {
        self.tail
    }

    /// Returns the number of currently stored bytes in the buffer.
    pub fn len(&self) -> usize {
        (self.tail - self.head) as usize
    }

    /// Returns `true` if the buffer contains no valid stored bytes.
    pub fn is_empty(&self) -> bool {
        self.tail == self.head
    }

    /// Returns the available byte capacity remaining.
    pub fn available(&self) -> usize {
        self.capacity - self.len()
    }

    /// Advances the `head` pointer to `new_head`, evicting older data up to that offset.
    pub fn advance_head(&mut self, new_head: u64) -> Result<(), StorageError> {
        if new_head < self.head {
            return Err(StorageError::WriteError(format!(
                "Cannot move head backwards from {} to {}",
                self.head, new_head
            )));
        }
        if new_head > self.tail {
            return Err(StorageError::WriteError(format!(
                "Cannot advance head ({}) beyond tail ({})",
                new_head, self.tail
            )));
        }
        self.head = new_head;
        Ok(())
    }
}

impl CircularWal for RingBufferWal {
    fn append(&mut self, data: &[u8]) -> Result<u64, StorageError> {
        if data.is_empty() {
            return Ok(self.tail);
        }

        if data.len() > self.available() {
            return Err(StorageError::BufferFull);
        }

        let start_offset = self.tail;
        let start_index = (start_offset as usize) % self.capacity;
        let first_part = (self.capacity - start_index).min(data.len());
        let second_part = data.len() - first_part;

        self.buffer[start_index..start_index + first_part].copy_from_slice(&data[..first_part]);
        if second_part > 0 {
            self.buffer[..second_part].copy_from_slice(&data[first_part..]);
        }

        self.tail += data.len() as u64;
        Ok(start_offset)
    }

    fn read_offset(&self, offset: u64, len: usize) -> Result<Vec<u8>, StorageError> {
        if len == 0 {
            return Ok(Vec::new());
        }

        if offset < self.head {
            return Err(StorageError::ReadError(format!(
                "Requested offset {} is earlier than head offset {}",
                offset, self.head
            )));
        }

        let end_offset = offset
            .checked_add(len as u64)
            .ok_or_else(|| StorageError::ReadError("Offset arithmetic overflow".into()))?;

        if end_offset > self.tail {
            return Err(StorageError::ReadError(format!(
                "Requested end offset {} exceeds tail offset {}",
                end_offset, self.tail
            )));
        }

        let mut out = Vec::with_capacity(len);
        let start_index = (offset as usize) % self.capacity;
        let first_part = (self.capacity - start_index).min(len);
        let second_part = len - first_part;

        out.extend_from_slice(&self.buffer[start_index..start_index + first_part]);
        if second_part > 0 {
            out.extend_from_slice(&self.buffer[..second_part]);
        }

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wal_append_and_read() {
        let mut wal = RingBufferWal::new(32);
        let data1 = b"hello";
        let data2 = b" world";

        let offset1 = wal.append(data1).expect("Append 1 should succeed");
        assert_eq!(offset1, 0);

        let offset2 = wal.append(data2).expect("Append 2 should succeed");
        assert_eq!(offset2, 5);

        let read1 = wal.read_offset(offset1, data1.len()).expect("Read 1 should succeed");
        assert_eq!(read1, data1);

        let read2 = wal.read_offset(offset2, data2.len()).expect("Read 2 should succeed");
        assert_eq!(read2, data2);

        let read_combined = wal
            .read_offset(0, data1.len() + data2.len())
            .expect("Combined read should succeed");
        assert_eq!(read_combined, b"hello world");
    }

    #[test]
    fn test_wal_wrap_around() {
        let mut wal = RingBufferWal::new(10);
        let offset1 = wal.append(b"1234567").expect("Append should succeed"); // 7 bytes
        assert_eq!(offset1, 0);

        wal.advance_head(7).expect("Advance head should succeed");

        // Now start_index will be 7, writing 5 bytes wraps: 3 bytes at 7..10, 2 bytes at 0..2
        let offset2 = wal.append(b"ABCDE").expect("Append wrapped should succeed");
        assert_eq!(offset2, 7);

        let read = wal.read_offset(offset2, 5).expect("Read wrapped should succeed");
        assert_eq!(read, b"ABCDE");
    }

    #[test]
    fn test_wal_buffer_full() {
        let mut wal = RingBufferWal::new(10);
        wal.append(b"1234567890").expect("Append 10 bytes should succeed");

        let err = wal.append(b"x");
        assert_eq!(err, Err(StorageError::BufferFull));
    }

    #[test]
    fn test_wal_out_of_bounds_read() {
        let mut wal = RingBufferWal::new(20);
        wal.append(b"data").expect("Append should succeed");

        // Read past tail
        let err_tail = wal.read_offset(0, 10);
        assert!(matches!(err_tail, Err(StorageError::ReadError(_))));

        // Read before head
        wal.advance_head(4).expect("Advance head should succeed");
        let err_head = wal.read_offset(0, 2);
        assert!(matches!(err_head, Err(StorageError::ReadError(_))));
    }
}
