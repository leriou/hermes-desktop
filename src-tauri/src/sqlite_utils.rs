use rusqlite::Connection;
use std::path::Path;

const PRAGMA_RW: &str = "\
    PRAGMA journal_mode = WAL;\
    PRAGMA synchronous = NORMAL;\
    PRAGMA cache_size = -8192;\
    PRAGMA mmap_size = 67108864;\
    PRAGMA temp_store = MEMORY;";

const PRAGMA_RO: &str = "\
    PRAGMA cache_size = -8192;\
    PRAGMA mmap_size = 67108864;";

pub fn open_rw(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(PRAGMA_RW)?;
    Ok(conn)
}

pub fn open_ro(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    conn.execute_batch(PRAGMA_RO)?;
    Ok(conn)
}
