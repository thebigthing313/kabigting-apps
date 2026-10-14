// One place that decides what an API failure means for the user: a lost session goes to sign-in,
// a temporary password goes to change-password, anything else is a toast.
import { toast } from "sonner"
import { noticeServerVersion } from "@/shell/update-check"
import type { ApiErrorCode } from "@shared/api-error"

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | "network"

  constructor(status: number, code: ApiErrorCode | "network", message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function isEnvelope(body: unknown): body is { error: { code: ApiErrorCode; message: string } } {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "code" in body.error &&
    "message" in body.error &&
    typeof body.error.code === "string" &&
    typeof body.error.message === "string"
  )
}

async function toApiError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => null)
  if (isEnvelope(body))
    return new ApiRequestError(response.status, body.error.code, body.error.message)
  return new ApiRequestError(response.status, "internal", `Request failed (${response.status})`)
}

/** Full navigation, so nothing from the old session survives in memory. */
function leaveTo(path: string) {
  window.location.assign(path)
}

/** The `fetch` behind the typed API client: routes auth failures before anyone else sees them. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch {
    throw new ApiRequestError(0, "network", "You appear to be offline")
  }
  noticeServerVersion(response.headers.get("X-App-Version"))
  if (response.status === 401) {
    const here = window.location.pathname + window.location.search
    leaveTo(`/sign-in?redirect=${encodeURIComponent(here)}`)
  } else if (response.status === 403) {
    const error = await toApiError(response.clone())
    if (error.code === "password_change_required") leaveTo("/change-password")
  }
  return response
}

/** The body of a successful response; otherwise throws the API's error. */
export async function readJson<T>(response: Response & { json(): Promise<T> }): Promise<T> {
  if (!response.ok) throw await toApiError(response)
  return response.json()
}

/** True for a failure caused by having no network. */
export function isNetworkError(error: unknown): boolean {
  return (error instanceof ApiRequestError && error.code === "network") || !navigator.onLine
}

/** Tells the user a write failed (its optimistic change has been undone). */
export function reportError(error: unknown, action: string) {
  if (error instanceof ApiRequestError) {
    // Auth failures already navigate away; a toast would only flash.
    if (error.code === "unauthenticated" || error.code === "password_change_required") return
    toast.error(`${action} failed`, { description: error.message })
    return
  }
  toast.error(`${action} failed`, { description: "Something went wrong. Try again." })
}
