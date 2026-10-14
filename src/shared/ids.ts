import { v7 } from "uuid"

/** A new row id: UUIDv7, so ids sort by creation time. The client makes them; the server checks them. */
export function newId(): string {
  return v7()
}
