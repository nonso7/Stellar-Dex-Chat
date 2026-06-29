use soroban_sdk::{contractclient, Address, Env};

/// Interface that any price oracle contract must implement.
/// Returns the price of a token in USD with 7 decimal places
/// (i.e. 1 USD = 10_000_000).
#[contractclient(name = "OracleClient")]
pub trait PriceOracle {
    fn get_price(env: Env, token: Address) -> Option<i128>;
}

/// A price observation that also carries the ledger sequence at which it was
/// recorded, enabling on-chain freshness checks.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimestampedPrice {
    /// Price in USD with 7 decimal places.
    pub price: i128,
    /// Ledger sequence at which the price was recorded.
    pub recorded_at: u32,
}

impl TimestampedPrice {
    /// Returns `true` when the price was recorded within `max_age_ledgers`
    /// ledgers of `current_ledger`.
    ///
    /// # Staleness rule
    /// A price is **fresh** if `current_ledger - recorded_at <= max_age_ledgers`.
    /// It is **stale** when `current_ledger - recorded_at > max_age_ledgers`.
    pub fn is_fresh(&self, current_ledger: u32, max_age_ledgers: u32) -> bool {
        current_ledger.saturating_sub(self.recorded_at) <= max_age_ledgers
    }
}
