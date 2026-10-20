use crate::types::{TelemetryEvent, CoreError};

pub trait EventParser {
    fn parse<'a>(&self, raw: &'a [u8]) -> Result<TelemetryEvent<'a>, CoreError>;
}
