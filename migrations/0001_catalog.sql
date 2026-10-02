CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  products TEXT NOT NULL CHECK (json_valid(products)),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'initial',
  reason TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '[]',
  request_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_log (
  revision INTEGER PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  summary TEXT NOT NULL,
  before_products TEXT NOT NULL,
  after_products TEXT NOT NULL,
  request_id TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS catalog_audit AFTER UPDATE ON catalog BEGIN
  INSERT INTO audit_log (revision, actor, action, created_at, reason, summary, before_products, after_products, request_id)
  VALUES (NEW.revision, NEW.actor, 'catalog.update', NEW.updated_at, NEW.reason, NEW.summary, OLD.products, NEW.products, NEW.request_id);
END;
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'Audit records are immutable');
END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'Audit records are immutable');
END;
