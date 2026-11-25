export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    const error = { message: err.message };
    if (err.details) error.details = err.details;
    return res.status(err.status).json({ error });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Request body too large' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: "Invalid JSON body" } });
  }
  // Unknown error: log server-side only, never leak internals to the client.
  console.error(err);
  return res.status(500).json({ error: { message: "Internal server error" } });
}

// Prisma 8 surfaces driver failures as SqlQueryError carrying the Postgres SQLSTATE
// (there are no P2002/P2003 codes any more). 23505 = unique violation,
// 23503 = foreign-key violation.
// ctx: { unique?: string, fk?: { status, field?, message } }
export function mapPrismaError(err, ctx = {}) {
  if (err?.kind !== "sql_query") return null;
  if (err.sqlState === "23505" && ctx.unique)
    return new HttpError(409, ctx.unique);
  if (err.sqlState === "23503" && ctx.fk) {
    const { status, field, message } = ctx.fk;
    return new HttpError(
      status,
      message,
      field ? [{ field, message }] : undefined,
    );
  }
  return null;
}
