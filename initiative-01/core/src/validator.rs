use crate::types::{TelemetryEvent, CoreError};

pub trait EventValidator {
    fn validate(&self, event: &TelemetryEvent) -> Result<(), CoreError>;
}
