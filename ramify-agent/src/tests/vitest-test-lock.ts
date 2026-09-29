// The parent audit already owns the machine lock when it runs this suite.
// Local tests use injected private locks and never acquire the real one.
process.env.RAMIFY_AUDIT_TEST_LOCK_HELD = '1';
