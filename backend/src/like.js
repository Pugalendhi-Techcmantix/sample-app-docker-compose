// Escape LIKE/ILIKE wildcards (and the escape character itself) so that ilike behaves as a
// case-insensitive equality check. Postgres uses backslash as the default escape character.
export const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");
